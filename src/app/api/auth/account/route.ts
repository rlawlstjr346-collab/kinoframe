import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  authenticateLocalAccount,
  authenticateOrRegisterAccount,
  createSessionToken,
  getAuthConfigStatus,
  isSecureCookie,
  normalizeOAuthProvider,
  registerLocalAccount,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: {
    mode?: "register" | "login" | "auto";
    username?: string;
    password?: string;
    displayName?: string;
    provider?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "요청 형식이 올바르지 않습니다." },
      { status: 400 }
    );
  }

  const mode =
    body.mode === "register"
      ? "register"
      : body.mode === "login"
      ? "login"
      : "auto";
  const username = typeof body.username === "string" ? body.username : "";
  const password = typeof body.password === "string" ? body.password : "";
  const displayName =
    typeof body.displayName === "string" ? body.displayName : undefined;
  const linkedProvider = normalizeOAuthProvider(body.provider);

  const result =
    mode === "register"
      ? registerLocalAccount(username, password, displayName, linkedProvider)
      : mode === "login"
      ? authenticateLocalAccount(username, password)
      : authenticateOrRegisterAccount(
          username,
          password,
          displayName,
          linkedProvider
        );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const token = createSessionToken(result.user);
  const { supabaseEnabled } = getAuthConfigStatus();
  const res = NextResponse.json({
    authenticated: true,
    user: result.user,
    cloudSyncAvailable: supabaseEnabled,
  });

  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookie(req),
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return res;
}
