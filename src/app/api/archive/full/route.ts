import { NextResponse } from "next/server";
import {
  CATALOG_FULL_RELEASE_URL,
  WALL_ACTIVE_RELEASE_URL,
  getReleaseCatalogText,
  loadOfflineCatalog,
} from "@/lib/poc-loader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATALOG_CACHE = { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" };

/** Full cumulative catalog for in-browser deep search (catalog-full -> wall-active -> snapshot). */
export async function GET() {
  const text =
    (await getReleaseCatalogText(CATALOG_FULL_RELEASE_URL)) ??
    (await getReleaseCatalogText(WALL_ACTIVE_RELEASE_URL, 4500));
  if (text) {
    return new Response(text, {
      headers: { "Content-Type": "application/json; charset=utf-8", ...CATALOG_CACHE },
    });
  }
  return NextResponse.json({ items: loadOfflineCatalog().items }, { headers: CATALOG_CACHE });
}
