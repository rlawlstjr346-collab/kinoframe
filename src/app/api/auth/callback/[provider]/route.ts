import { NextRequest, NextResponse } from "next/server";
import {
  OAUTH_STATE_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  createSessionToken,
  getAppOrigin,
  isSecureCookie,
  verifyOAuthState,
  type OAuthProvider,
  type SessionUser,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ provider: string }> }
) {
  const { provider: rawProvider } = await context.params;
  const origin = getAppOrigin(req);

  if (
    rawProvider !== "google" &&
    rawProvider !== "naver" &&
    rawProvider !== "kakao"
  ) {
    return NextResponse.redirect(
      `${origin}/?auth=error&reason=invalid_provider`
    );
  }
  const provider: OAuthProvider = rawProvider;

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const stateCookie = req.cookies.get(OAUTH_STATE_COOKIE_NAME)?.value;

  if (!code || !verifyOAuthState(stateCookie, state, provider)) {
    return NextResponse.redirect(`${origin}/?auth=error&reason=state_mismatch`);
  }

  const redirectUri = `${origin}/api/auth/callback/${provider}`;

  try {
    let user: SessionUser;

    if (provider === "google") {
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: process.env.GOOGLE_CLIENT_ID || "",
          client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });
      if (!tokenRes.ok) throw new Error("GOOGLE_TOKEN_FAILED");
      const tokenJson = (await tokenRes.json()) as { access_token?: string };
      if (!tokenJson.access_token) throw new Error("GOOGLE_NO_TOKEN");

      const profileRes = await fetch(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        { headers: { Authorization: `Bearer ${tokenJson.access_token}` } }
      );
      if (!profileRes.ok) throw new Error("GOOGLE_PROFILE_FAILED");
      const profile = (await profileRes.json()) as {
        id: string;
        name?: string;
        email?: string;
        picture?: string;
      };
      user = {
        sub: `google:${profile.id}`,
        provider: "google",
        name: profile.name || profile.email || "Google User",
        email: profile.email,
        avatar: profile.picture,
      };
    } else if (provider === "naver") {
      const tokenParams = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: process.env.NAVER_CLIENT_ID || "",
        client_secret: process.env.NAVER_CLIENT_SECRET || "",
        code,
        state: state || "",
      });
      const tokenRes = await fetch(
        `https://nid.naver.com/oauth2.0/token?${tokenParams.toString()}`,
        { method: "GET" }
      );
      if (!tokenRes.ok) throw new Error("NAVER_TOKEN_FAILED");
      const tokenJson = (await tokenRes.json()) as { access_token?: string };
      if (!tokenJson.access_token) throw new Error("NAVER_NO_TOKEN");

      const profileRes = await fetch("https://openapi.naver.com/v1/nid/me", {
        headers: { Authorization: `Bearer ${tokenJson.access_token}` },
      });
      if (!profileRes.ok) throw new Error("NAVER_PROFILE_FAILED");
      const profileJson = (await profileRes.json()) as {
        response?: {
          id?: string;
          name?: string;
          nickname?: string;
          email?: string;
          profile_image?: string;
        };
      };
      const r = profileJson.response;
      if (!r?.id) throw new Error("NAVER_NO_PROFILE");
      user = {
        sub: `naver:${r.id}`,
        provider: "naver",
        name: r.nickname || r.name || r.email || "Naver User",
        email: r.email,
        avatar: r.profile_image,
      };
    } else {
      const tokenBody = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: process.env.KAKAO_CLIENT_ID || "",
        redirect_uri: redirectUri,
        code,
      });
      if (process.env.KAKAO_CLIENT_SECRET?.trim()) {
        tokenBody.set("client_secret", process.env.KAKAO_CLIENT_SECRET.trim());
      }
      const tokenRes = await fetch("https://kauth.kakao.com/oauth/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
        },
        body: tokenBody,
      });
      if (!tokenRes.ok) throw new Error("KAKAO_TOKEN_FAILED");
      const tokenJson = (await tokenRes.json()) as { access_token?: string };
      if (!tokenJson.access_token) throw new Error("KAKAO_NO_TOKEN");

      const profileRes = await fetch("https://kapi.kakao.com/v2/user/me", {
        headers: {
          Authorization: `Bearer ${tokenJson.access_token}`,
          "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
        },
      });
      if (!profileRes.ok) throw new Error("KAKAO_PROFILE_FAILED");
      const profileJson = (await profileRes.json()) as {
        id?: number | string;
        properties?: { nickname?: string; profile_image?: string };
        kakao_account?: {
          email?: string;
          profile?: { nickname?: string; profile_image_url?: string };
        };
      };
      if (!profileJson.id) throw new Error("KAKAO_NO_PROFILE");
      const nickname =
        profileJson.kakao_account?.profile?.nickname ||
        profileJson.properties?.nickname ||
        profileJson.kakao_account?.email ||
        "Kakao User";
      const avatar =
        profileJson.kakao_account?.profile?.profile_image_url ||
        profileJson.properties?.profile_image;
      user = {
        sub: `kakao:${profileJson.id}`,
        provider: "kakao",
        name: nickname,
        email: profileJson.kakao_account?.email,
        avatar,
      };
    }

    const sessionToken = createSessionToken(user);
    const res = NextResponse.redirect(`${origin}/?auth=success`);
    res.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: isSecureCookie(req),
      path: "/",
      maxAge: 60 * 60 * 24 * 14,
    });
    res.cookies.delete(OAUTH_STATE_COOKIE_NAME);
    return res;
  } catch {
    return NextResponse.redirect(`${origin}/?auth=error&reason=oauth_exchange`);
  }
}
