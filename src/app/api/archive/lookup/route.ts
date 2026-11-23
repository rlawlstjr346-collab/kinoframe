import { NextRequest, NextResponse } from "next/server";
import { loadFullCatalogForLookup } from "@/lib/poc-loader";
import { searchItemByQuery } from "@/lib/visual-techniques";
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
    let queryCount = 0;
    for (const item of catalog) {
      if (seen.has(item.id)) continue;
      if (searchItemByQuery(item, queryParam)) {
        seen.add(item.id);
        matched.push(item);
        queryCount += 1;
        if (queryCount >= 120) break;
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
        "Cache-Control": "public, max-age=60, s-maxage=300",
      },
    }
  );
}
