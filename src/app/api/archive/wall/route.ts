import { NextResponse } from "next/server";
import { loadWallActiveCatalog } from "@/lib/poc-loader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const { items, source } = await loadWallActiveCatalog({
    exactBust: Date.now(),
  });

  return NextResponse.json(
    {
      items,
      source,
      activeCount: items.length,
      fetchedAt: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        Pragma: "no-cache",
      },
    }
  );
}
