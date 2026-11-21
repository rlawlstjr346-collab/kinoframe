import crypto from "node:crypto";
import type { NextRequest } from "next/server";

export type OAuthProvider = "google" | "naver";

export interface SessionUser {
  sub: string;
  provider: OAuthProvider;
  name: string;
  email?: string;
  avatar?: string;
}

interface SignedSessionPayload extends SessionUser {
  exp: number;
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
  const exp = Math.floor(Date.now() / 1000) + 600; // 10 min
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

export function getAuthConfigStatus() {
  const google = Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim()
  );
  const naver = Boolean(
    process.env.NAVER_CLIENT_ID?.trim() &&
      process.env.NAVER_CLIENT_SECRET?.trim()
  );
  const supabaseEnabled = Boolean(
    process.env.SUPABASE_URL?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  );
  return { google, naver, supabaseEnabled };
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
