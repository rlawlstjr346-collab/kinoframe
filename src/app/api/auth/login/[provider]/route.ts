import { NextRequest, NextResponse } from "next/server";
import {
  OAUTH_STATE_COOKIE_NAME,
  createOAuthState,
  getAppOrigin,
  getAuthConfigStatus,
  isSecureCookie,
  type OAuthProvider,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ provider: string }> }
) {
  const { provider: rawProvider } = await context.params;
  if (
    rawProvider !== "google" &&
    rawProvider !== "naver" &&
    rawProvider !== "kakao"
  ) {
    return NextResponse.json(
      { error: "지원하지 않는 로그인 공급자입니다." },
      { status: 400 }
    );
  }
  const provider: OAuthProvider = rawProvider;
  const status = getAuthConfigStatus();
  const origin = getAppOrigin(req);

  if (!status[provider]) {
    return NextResponse.redirect(
      `${origin}/?auth=unconfigured&provider=${provider}`
    );
  }

  const { state, signedCookie } = createOAuthState(provider);
  const redirectUri = `${origin}/api/auth/callback/${provider}`;

  let authUrl: string;
  if (provider === "google") {
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      prompt: "select_account",
    });
    authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  } else if (provider === "naver") {
    const params = new URLSearchParams({
      client_id: process.env.NAVER_CLIENT_ID!,
      redirect_uri: redirectUri,
      response_type: "code",
      state,
    });
    authUrl = `https://nid.naver.com/oauth2.0/authorize?${params.toString()}`;
  } else {
    const params = new URLSearchParams({
      client_id: process.env.KAKAO_CLIENT_ID!,
      redirect_uri: redirectUri,
      response_type: "code",
      state,
    });
    authUrl = `https://kauth.kakao.com/oauth/authorize?${params.toString()}`;
  }

  const res = NextResponse.redirect(authUrl);
  res.cookies.set(OAUTH_STATE_COOKIE_NAME, signedCookie, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookie(req),
    path: "/",
    maxAge: 600,
  });
  return res;
}
