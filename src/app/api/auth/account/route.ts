import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  authenticateLocalAccount,
  authenticateLocalSocialProfile,
  createSessionToken,
  getAuthConfigStatus,
  isSecureCookie,
  registerLocalAccount,
  type OAuthProvider,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: {
    mode?: "register" | "login" | "social_local";
    provider?: OAuthProvider;
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

  // Local 1-click social profile fallback when OAuth env keys are not set locally
  if (body.mode === "social_local") {
    const provider = body.provider;
    if (provider !== "kakao" && provider !== "naver" && provider !== "google") {
      return NextResponse.json(
        { error: "지원하지 않는 소셜 공급자입니다." },
        { status: 400 }
      );
    }
    const user = authenticateLocalSocialProfile(provider);
    const token = createSessionToken(user);
    const { supabaseEnabled } = getAuthConfigStatus();
    const res = NextResponse.json({
      authenticated: true,
      user,
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
