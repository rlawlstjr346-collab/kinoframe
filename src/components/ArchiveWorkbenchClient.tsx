"use client";

import dynamic from "next/dynamic";
import { Suspense, useEffect, useState } from "react";
import type { ArchiveItem, AspectRatio } from "@/types/archive";
import { normalizeCatalogPayload } from "@/lib/catalog-payload";
import { WorkbenchFallback } from "./WorkbenchFallback";

// Skeleton geometry for the dynamic() loading state (set from props before first render).
let skeletonAspects: AspectRatio[] = [];

/**
 * The interactive wall is browser-only: the Worker no longer server-renders ~500 KB of wall
 * markup per request. The live catalog is streamed from /api/archive/wall instead.
 */
const ArchiveWorkbench = dynamic(
  () => import("./ArchiveWorkbench").then((mod) => mod.ArchiveWorkbench),
  { ssr: false, loading: () => <WorkbenchFallback aspects={skeletonAspects} /> }
);

async function loadWallItems(): Promise<ArchiveItem[]> {
  const res = await fetch("/api/archive/wall", { cache: "no-store" });
  if (!res.ok) throw new Error(`wall ${res.status}`);
  const items = normalizeCatalogPayload(await res.json());
  if (items.length === 0) throw new Error("empty wall");
  return items;
}

export function ArchiveWorkbenchClient({ aspects }: { aspects: AspectRatio[] }) {
  skeletonAspects = aspects;
  const [items, setItems] = useState<ArchiveItem[] | null>(null);

  useEffect(() => {
    let alive = true;
    // Warm the workbench chunk while the catalog downloads.
    void import("./ArchiveWorkbench");
    const load = (attempt: number) =>
      loadWallItems()
        .then((next) => alive && setItems(next))
        .catch(() => alive && attempt < 3 && setTimeout(() => load(attempt + 1), 1500 * attempt));
    load(1);
    return () => {
      alive = false;
    };
  }, []);

  if (!items) return <WorkbenchFallback aspects={aspects} />;
  return (
    <Suspense fallback={<WorkbenchFallback aspects={aspects} />}>
      <ArchiveWorkbench items={items} />
    </Suspense>
  );
}
