import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
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

function getLocalVaultPath(userSub: string): string {
  const vaultsDir = path.join(process.cwd(), ".data", "vaults");
  if (!fs.existsSync(vaultsDir)) {
    fs.mkdirSync(vaultsDir, { recursive: true });
  }
  const safeKey = crypto.createHash("sha256").update(userSub).digest("hex").slice(0, 32);
  return path.join(vaultsDir, `${safeKey}.json`);
}

function readServerLocalVault(userSub: string): VaultState | null {
  try {
    const filePath = getLocalVaultPath(userSub);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as VaultState;
  } catch {
    return null;
  }
}

function writeServerLocalVault(userSub: string, vault: VaultState): boolean {
  try {
    const filePath = getLocalVaultPath(userSub);
    fs.writeFileSync(filePath, JSON.stringify(vault, null, 2) + "\n", "utf8");
    return true;
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const user = verifySessionToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!user) {
    return NextResponse.json({
      mode: "guest",
      synced: false,
      vault: null,
    });
  }

  const sb = getSupabaseConfig();
  if (sb) {
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
      if (res.ok) {
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
      }
    } catch {
      // fallback to server file vault
    }
  }

  const localVault = readServerLocalVault(user.sub);
  return NextResponse.json({
    mode: "server_local",
    synced: true,
    vault: localVault,
  });
}

export async function PUT(req: NextRequest) {
  const user = verifySessionToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!user) {
    return NextResponse.json(
      { error: "로그인이 필요합니다.", mode: "guest", synced: false },
      { status: 401 }
    );
  }

  let body: { vault?: VaultState };
  try {
    body = (await req.json()) as { vault?: VaultState };
  } catch {
    return NextResponse.json(
      { error: "잘못된 요청 형식입니다." },
      { status: 400 }
    );
  }

  if (!body.vault) {
    return NextResponse.json(
      { error: "vault 데이터가 필요합니다." },
      { status: 400 }
    );
  }

  const sb = getSupabaseConfig();
  if (sb) {
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
      if (res.ok) {
        return NextResponse.json({ mode: "cloud", synced: true });
      }
    } catch {
      // fallback to server file vault
    }
  }

  const saved = writeServerLocalVault(user.sub, body.vault);
  return NextResponse.json({
    mode: saved ? "server_local" : "local",
    synced: saved,
  });
}
