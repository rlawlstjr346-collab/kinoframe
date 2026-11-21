import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import type { VaultState } from "@/types/archive";

export const runtime = "nodejs";

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return { url, key };
}

export async function GET(req: NextRequest) {
  const user = verifySessionToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  const sb = getSupabaseConfig();

  if (!user || !sb) {
    return NextResponse.json({
      mode: "local",
      synced: false,
      vault: null,
    });
  }

  try {
    const res = await fetch(
      `${sb.url}/rest/v1/user_vaults?user_sub=eq.${encodeURIComponent(
        user.sub
      )}&select=payload,updated_at&limit=1`,
      {
        headers: {
          apikey: sb.key,
          Authorization: `Bearer ${sb.key}`,
          Accept: "application/json",
        },
        cache: "no-store",
      }
    );
    if (!res.ok) {
      return NextResponse.json({
        mode: "local",
        synced: false,
        vault: null,
      });
    }
    const rows = (await res.json()) as Array<{
      payload?: VaultState;
      updated_at?: string;
    }>;
    return NextResponse.json({
      mode: "cloud",
      synced: true,
      vault: rows[0]?.payload ?? null,
      updatedAt: rows[0]?.updated_at ?? null,
    });
  } catch {
    return NextResponse.json({
      mode: "local",
      synced: false,
      vault: null,
    });
  }
}

export async function PUT(req: NextRequest) {
  const user = verifySessionToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  const sb = getSupabaseConfig();

  let body: { vault?: VaultState };
  try {
    body = (await req.json()) as { vault?: VaultState };
  } catch {
    return NextResponse.json({ error: "잘못된 요청 형식입니다." }, { status: 400 });
  }

  if (!body.vault) {
    return NextResponse.json({ error: "vault 데이터가 필요합니다." }, { status: 400 });
  }

  if (!user || !sb) {
    return NextResponse.json({
      mode: "local",
      synced: false,
    });
  }

  try {
    const res = await fetch(
      `${sb.url}/rest/v1/user_vaults?on_conflict=user_sub`,
      {
        method: "POST",
        headers: {
          apikey: sb.key,
          Authorization: `Bearer ${sb.key}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify({
          user_sub: user.sub,
          provider: user.provider,
          payload: body.vault,
          updated_at: new Date().toISOString(),
        }),
      }
    );

    return NextResponse.json({
      mode: res.ok ? "cloud" : "local",
      synced: res.ok,
    });
  } catch {
    return NextResponse.json({
      mode: "local",
      synced: false,
    });
  }
}
