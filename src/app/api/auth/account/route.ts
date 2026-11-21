import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  authenticateLocalAccount,
  createSessionToken,
  getAuthConfigStatus,
  isSecureCookie,
  registerLocalAccount,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: {
    mode?: "register" | "login";
    username?: string;
    password?: string;
    displayName?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "요청 형식이 올바르지 않습니다." },
      { status: 400 }
    );
  }

  const mode = body.mode === "register" ? "register" : "login";
  const username = typeof body.username === "string" ? body.username : "";
  const password = typeof body.password === "string" ? body.password : "";
  const displayName =
    typeof body.displayName === "string" ? body.displayName : undefined;

  const result =
    mode === "register"
      ? registerLocalAccount(username, password, displayName)
      : authenticateLocalAccount(username, password);

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
    maxAge: 60 * 60 * 24 * 14,
  });

  return res;
}
