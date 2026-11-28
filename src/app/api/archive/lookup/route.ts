import { NextRequest, NextResponse } from "next/server";
import { loadFullCatalogForLookup } from "@/lib/poc-loader";
import { searchArchiveItems } from "@/lib/search";
import type { ArchiveItem } from "@/types/archive";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const idsParam = req.nextUrl.searchParams.get("ids")?.trim() || "";
  const queryParam = req.nextUrl.searchParams.get("q")?.trim() || "";

  const catalog = await loadFullCatalogForLookup();
  const matched: ArchiveItem[] = [];
  const seen = new Set<string>();

  if (idsParam) {
    const requestedIds = new Set(
      idsParam
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
        .slice(0, 240)
    );
    for (const item of catalog) {
      if (requestedIds.has(item.id) && !seen.has(item.id)) {
        seen.add(item.id);
        matched.push(item);
      }
    }
  }

  if (queryParam) {
    const hits = searchArchiveItems(catalog, queryParam).slice(0, 120);
    for (const item of hits) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        matched.push(item);
      }
    }
  }

  return NextResponse.json(
    {
      items: matched,
      totalCatalog: catalog.length,
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    }
  );
}
