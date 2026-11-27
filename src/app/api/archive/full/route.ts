import { NextResponse } from "next/server";
import {
  CATALOG_FULL_RELEASE_URL,
  WALL_ACTIVE_RELEASE_URL,
  fetchReleaseCatalogStream,
  loadOfflineCatalog,
} from "@/lib/poc-loader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE = { "Cache-Control": "public, max-age=60, s-maxage=300" };

/**
 * Full cumulative catalog for in-browser deep search. Streamed unparsed (same fallback order
 * as loadFullCatalogForLookup: catalog-full -> wall-active -> offline snapshot).
 */
export async function GET() {
  const upstream =
    (await fetchReleaseCatalogStream(CATALOG_FULL_RELEASE_URL)) ??
    (await fetchReleaseCatalogStream(WALL_ACTIVE_RELEASE_URL, 4500));
  if (upstream) {
    return new Response(upstream.body, {
      headers: { "Content-Type": "application/json; charset=utf-8", ...CACHE },
    });
  }
  return NextResponse.json({ items: loadOfflineCatalog().items }, { headers: CACHE });
}
