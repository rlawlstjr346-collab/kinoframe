import React, { Suspense } from "react";
import type { ArchiveItem } from "@/types/archive";
import { ArchiveWorkbench } from "@/components/ArchiveWorkbench";
import { getAspectRatioClass } from "@/lib/taxonomy";
import { loadWallActiveCatalog } from "@/lib/poc-loader";

export const dynamic = "force-dynamic";

function WorkbenchFallback({ items }: { items: ArchiveItem[] }) {
  return (
    <div className="min-h-screen w-full bg-[#0A0B0E] text-[#F2EFE9]">
      <div className="fixed inset-x-0 top-0 z-50 h-[clamp(60px,3.8vw,80px)] bg-[#0A0B0E] px-6 py-3">
        <div className="flex h-full items-center justify-between">
          <span className="text-[1.4rem] font-bold tracking-tight text-[#F2EFE9]">
            KINOFRAME<span className="text-[#C89E52]">.</span>
          </span>
        </div>
      </div>
      <div className="mx-auto w-full px-3 pt-[clamp(66px,4.2vw,88px)] sm:px-4 lg:px-6">
        <div className="grid grid-cols-2 items-start gap-[7px] md:grid-cols-3 lg:grid-cols-5">
          {items.slice(0, 15).map((item) => (
            <div
              key={item.id}
              className={`w-full overflow-hidden rounded-[16px] bg-[#0B0C0F] ring-1 ring-white/[0.08] ${
                item.aspectRatio === "4:5"
                  ? "aspect-[4/3]"
                  : getAspectRatioClass(item.aspectRatio)
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default async function HomePage() {
  const { items, disableConduit } = await loadWallActiveCatalog();
  const initialSeed = Math.floor(Math.random() * 900_000) + 100_000;
  return (
    <Suspense fallback={<WorkbenchFallback items={items} />}>
      <ArchiveWorkbench
        items={items}
        initialSeed={initialSeed}
        disableConduit={disableConduit}
      />
    </Suspense>
  );
}
