import React, { Suspense } from "react";
import type { ArchiveItem } from "@/types/archive";
import { ArchiveWorkbench } from "@/components/ArchiveWorkbench";
import { getAspectRatioClass } from "@/lib/taxonomy";
import { loadWallActiveCatalog } from "@/lib/poc-loader";

export const dynamic = "force-dynamic";

function WorkbenchFallback({ items }: { items: ArchiveItem[] }) {
  return (
    <div className="min-h-screen w-full bg-[#000000] text-white">
      <div className="fixed inset-x-0 top-0 z-50 h-[clamp(62px,3.8vw,78px)] bg-[#000000]/80 px-6 py-3 backdrop-blur-2xl">
        <div className="flex h-full items-center justify-between">
          <span className="text-[1.35rem] font-bold tracking-tight text-white">
            KINOFRAME<span className="text-[#C89E52]">.</span>
          </span>
        </div>
      </div>
      <div className="mx-auto w-full px-3 pt-[clamp(68px,4.3vw,88px)] sm:px-4 lg:px-6">
        <div className="grid grid-cols-2 items-start gap-[8px] md:grid-cols-3 lg:grid-cols-5">
          {items.slice(0, 15).map((item) => (
            <div
              key={item.id}
              className={`w-full overflow-hidden rounded-[18px] bg-[#141416] ring-1 ring-white/[0.07] ${
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
  const { items } = await loadWallActiveCatalog();
  return (
    <Suspense fallback={<WorkbenchFallback items={items} />}>
      <ArchiveWorkbench items={items} />
    </Suspense>
  );
}
