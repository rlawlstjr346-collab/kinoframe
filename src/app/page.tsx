import React, { Suspense } from "react";
import archiveSnapshot from "@/data/archive-snapshot.json";
import type { ArchiveItem } from "@/types/archive";
import { ArchiveWorkbench } from "@/components/ArchiveWorkbench";
import { getAspectRatioClass } from "@/lib/taxonomy";

export const dynamic = "force-dynamic";

const ARCHIVE_ITEMS = archiveSnapshot as ArchiveItem[];

function WorkbenchFallback() {
  return (
    <div className="min-h-screen w-full bg-black text-[#FAF7F0]">
      <div className="fixed inset-x-0 top-0 z-50 h-16 bg-black px-6 py-3">
        <div className="flex h-full items-center justify-between">
          <span className="text-[1.7rem] font-semibold tracking-tight text-[#F3A833]">
            KINOFRAME
          </span>
        </div>
      </div>
      <div className="mx-auto w-full px-4 pt-24 lg:px-8">
        <div className="grid grid-cols-2 items-start gap-[7px] md:grid-cols-3 lg:grid-cols-5">
          {ARCHIVE_ITEMS.slice(0, 15).map((item) => (
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

export default function HomePage() {
  const initialSeed = Math.floor(Math.random() * 900_000) + 100_000;
  return (
    <Suspense fallback={<WorkbenchFallback />}>
      <ArchiveWorkbench items={ARCHIVE_ITEMS} initialSeed={initialSeed} />
    </Suspense>
  );
}
