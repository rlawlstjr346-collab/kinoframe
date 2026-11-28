import { NextResponse } from "next/server";
import { WALL_ACTIVE_RELEASE_URL, getReleaseCatalogText, loadOfflineCatalog } from "@/lib/poc-loader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATALOG_CACHE = { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" };

export async function GET() {
  // Served verbatim from the isolate cache; the browser validates it with normalizeCatalogPayload.
  const text = await getReleaseCatalogText(WALL_ACTIVE_RELEASE_URL);
  if (text) {
    return new Response(text, {
      headers: { "Content-Type": "application/json; charset=utf-8", ...CATALOG_CACHE },
    });
  }
  const { items, source } = loadOfflineCatalog();
  return NextResponse.json({ items, source, activeCount: items.length }, { headers: CATALOG_CACHE });
}
