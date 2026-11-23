import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { NextRequest } from "next/server";

export type OAuthProvider = "google" | "naver" | "kakao";
export type AuthProvider = OAuthProvider | "account";

export interface SessionUser {
  sub: string;
  provider: AuthProvider;
  name: string;
  email?: string;
  avatar?: string;
}

interface SignedSessionPayload extends SessionUser {
  exp: number;
}

interface StoredAccount {
  id: string;
  username: string;
  displayName: string;
  passwordHash: string;
  createdAt: string;
}

export const SESSION_COOKIE_NAME = "kinoframe_session";
export const OAUTH_STATE_COOKIE_NAME = "kinoframe_oauth_state";
const SESSION_TTL_SEC = 60 * 60 * 24 * 14; // 14 days

function getSigningSecret(): string {
  return (
    process.env.KINOFRAME_SESSION_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "kinoframe-local-darkroom-dev-secret-change-in-prod"
  );
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function signData(data: string): string {
  return crypto
    .createHmac("sha256", getSigningSecret())
    .update(data)
    .digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  const derivedHex = crypto.scryptSync(password, salt, 64).toString("hex");
  return safeEqual(derivedHex, expectedHex);
}

function getUsersFilePath(): string {
  const dataDir = path.join(process.cwd(), ".data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return path.join(dataDir, "users.json");
}

function readStoredUsers(): StoredAccount[] {
  const filePath = getUsersFilePath();
  try {
    if (!fs.existsSync(filePath)) return [];
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return Array.isArray(parsed) ? (parsed as StoredAccount[]) : [];
  } catch {
    return [];
  }
}

function writeStoredUsers(users: StoredAccount[]): void {
  const filePath = getUsersFilePath();
  fs.writeFileSync(filePath, JSON.stringify(users, null, 2) + "\n", "utf8");
}

export function registerLocalAccount(
  rawUsername: string,
  password: string,
  rawDisplayName?: string
): { ok: true; user: SessionUser } | { ok: false; error: string; status: number } {
  const username = rawUsername.trim().toLowerCase();
  const displayName = (rawDisplayName?.trim() || rawUsername.trim()).slice(0, 32);

  if (username.length < 2 || username.length > 64) {
    return { ok: false, error: "아이디는 2자 이상 64자 이하로 입력해주세요.", status: 400 };
  }
  if (password.length < 4 || password.length > 128) {
    return { ok: false, error: "비밀번호는 4자 이상 입력해주세요.", status: 400 };
  }

  const users = readStoredUsers();
  if (users.some((u) => u.username === username)) {
    return { ok: false, error: "이미 사용 중인 아이디입니다.", status: 409 };
  }

  const id = crypto.randomBytes(10).toString("hex");
  const record: StoredAccount = {
    id,
    username,
    displayName,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
  };
  users.push(record);
  writeStoredUsers(users);

  return {
    ok: true,
    user: {
      sub: `account:${record.id}`,
      provider: "account",
      name: record.displayName,
      email: username.includes("@") ? username : undefined,
    },
  };
}

export function authenticateLocalAccount(
  rawUsername: string,
  password: string
): { ok: true; user: SessionUser } | { ok: false; error: string; status: number } {
  const username = rawUsername.trim().toLowerCase();
  const users = readStoredUsers();
  const found = users.find((u) => u.username === username);
  if (!found || !verifyPassword(password, found.passwordHash)) {
    return { ok: false, error: "아이디 또는 비밀번호가 일치하지 않습니다.", status: 401 };
  }
  return {
    ok: true,
    user: {
      sub: `account:${found.id}`,
      provider: "account",
      name: found.displayName,
      email: username.includes("@") ? username : undefined,
    },
  };
}

export function createSessionToken(user: SessionUser): string {
  const payload: SignedSessionPayload = {
    ...user,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SEC,
  };
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const sig = signData(encoded);
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string | undefined): SessionUser | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expected = signData(encoded);
  if (!safeEqual(sig, expected)) return null;

  try {
    const parsed = JSON.parse(base64UrlDecode(encoded)) as SignedSessionPayload;
    if (!parsed.sub || !parsed.provider || !parsed.exp) return null;
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return {
      sub: parsed.sub,
      provider: parsed.provider,
      name: parsed.name || "Director",
      email: parsed.email,
      avatar: parsed.avatar,
    };
  } catch {
    return null;
  }
}

export function createOAuthState(provider: OAuthProvider): {
  state: string;
  signedCookie: string;
} {
  const nonce = crypto.randomBytes(16).toString("hex");
  const state = `${provider}_${nonce}`;
  const exp = Math.floor(Date.now() / 1000) + 600;
  const encoded = base64UrlEncode(JSON.stringify({ state, provider, exp }));
  const sig = signData(encoded);
  return { state, signedCookie: `${encoded}.${sig}` };
}

export function verifyOAuthState(
  cookieVal: string | undefined,
  incomingState: string | null,
  expectedProvider: OAuthProvider
): boolean {
  if (!cookieVal || !incomingState) return false;
  const parts = cookieVal.split(".");
  if (parts.length !== 2) return false;
  const [encoded, sig] = parts;
  if (!safeEqual(sig, signData(encoded))) return false;
  try {
    const parsed = JSON.parse(base64UrlDecode(encoded)) as {
      state: string;
      provider: OAuthProvider;
      exp: number;
    };
    if (parsed.exp < Math.floor(Date.now() / 1000)) return false;
    if (parsed.provider !== expectedProvider) return false;
    return safeEqual(parsed.state, incomingState);
  } catch {
    return false;
  }
}

export function authenticateLocalSocialProfile(
  provider: OAuthProvider
): SessionUser {
  const presets: Record<OAuthProvider, { name: string; email: string }> = {
    kakao: { name: "카카오 디렉터", email: "director@kakao.local" },
    naver: { name: "네이버 디렉터", email: "director@naver.local" },
    google: { name: "Google Director", email: "director@google.local" },
  };
  const info = presets[provider];
  return {
    sub: `${provider}:local-director`,
    provider,
    name: info.name,
    email: info.email,
  };
}

export function getAuthConfigStatus() {
  const google = Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim()
  );
  const naver = Boolean(
    process.env.NAVER_CLIENT_ID?.trim() &&
      process.env.NAVER_CLIENT_SECRET?.trim()
  );
  const kakao = Boolean(
    process.env.KAKAO_CLIENT_ID?.trim() &&
      process.env.KAKAO_CLIENT_SECRET?.trim()
  );
  const supabaseEnabled = Boolean(
    process.env.SUPABASE_URL?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  );
  return { google, naver, kakao, supabaseEnabled };
}

export function getAppOrigin(req: NextRequest): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (envUrl) return envUrl.replace(/\/$/, "");
  return req.nextUrl.origin;
}

export function isSecureCookie(req: NextRequest): boolean {
  return (
    process.env.NODE_ENV === "production" &&
    req.nextUrl.protocol === "https:"
  );
}
