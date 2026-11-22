import { NextRequest, NextResponse } from "next/server";
import type {
  ArchiveCategory,
  CountryCode,
  Era,
  MediaMode,
} from "@/types/archive";
import { queryConduitStream } from "@/lib/conduit";

export const runtime = "nodejs";

const VALID_CATEGORIES = new Set<ArchiveCategory | "ALL">([
  "ALL",
  "TVCF",
  "CLASSIC_FILM",
  "STREET_ERA",
  "WEB_PHANTOM",
  "AD_BILLBOARD",
  "ALBUM_POSTER",
  "ANIME_COMIC",
  "PHOTO",
]);

const VALID_COUNTRIES = new Set<CountryCode | "ALL">([
  "ALL",
  "KR",
  "JP",
  "TW",
  "US",
  "EU",
  "GLOBAL",
]);

const VALID_DECADES = new Set<Era | "ALL">([
  "ALL",
  "1950-60s",
  "1970s",
  "1980s",
  "1990-00s",
]);

const VALID_MEDIA_MODES = new Set<MediaMode>(["ALL", "MOTION", "STILL"]);

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;

  const rawCategory = (params.get("category") || "ALL") as ArchiveCategory | "ALL";
  const category = VALID_CATEGORIES.has(rawCategory) ? rawCategory : "ALL";

  const rawCountry = (params.get("country") || "ALL") as CountryCode | "ALL";
  const country = VALID_COUNTRIES.has(rawCountry) ? rawCountry : "ALL";

  const rawDecade = (params.get("decade") || params.get("era") || "ALL") as
    | Era
    | "ALL";
  const decade = VALID_DECADES.has(rawDecade) ? rawDecade : "ALL";

  const rawMediaMode = (params.get("mediaMode") || "ALL") as MediaMode;
  const mediaMode = VALID_MEDIA_MODES.has(rawMediaMode) ? rawMediaMode : "ALL";

  const q = (params.get("q") || "").trim().slice(0, 120);
  const cursor = Math.max(
    1,
    Math.min(200, Number.parseInt(params.get("cursor") || "1", 10) || 1)
  );
  const seed = Math.max(
    1,
    Math.abs(Number.parseInt(params.get("seed") || "1", 10) || 1)
  );

  try {
    const payload = await queryConduitStream({
      category,
      country,
      decade,
      mediaMode,
      q,
      cursor,
      seed,
    });

    return NextResponse.json(payload, {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600",
      },
    });
  } catch {
    return NextResponse.json(
      {
        items: [],
        cursor,
        nextCursor: null,
        hasMore: false,
        cached: false,
        sources: { archiveOrg: 0, wikimedia: 0 },
        degraded: true,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      }
    );
  }
}
