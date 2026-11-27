import { NextResponse } from "next/server";
import {
  WALL_ACTIVE_RELEASE_URL,
  fetchReleaseCatalogStream,
  loadOfflineCatalog,
} from "@/lib/poc-loader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
};

export async function GET() {
  // Stream the fresh release JSON as-is ({ items: [...] }); the browser validates it with
  // normalizeCatalogPayload, so the Worker never parses the ~400 KB catalog.
  const upstream = await fetchReleaseCatalogStream(WALL_ACTIVE_RELEASE_URL);
  if (upstream) {
    return new Response(upstream.body, {
      headers: { "Content-Type": "application/json; charset=utf-8", ...NO_STORE },
    });
  }

  const { items, source } = loadOfflineCatalog();
  return NextResponse.json(
    {
      items,
      source,
      activeCount: items.length,
      fetchedAt: new Date().toISOString(),
    },
    { headers: NO_STORE }
  );
}
