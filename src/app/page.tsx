import React, { Suspense } from "react";
import archiveSnapshot from "@/data/archive-snapshot.json";
import type { ArchiveItem } from "@/types/archive";
import { ArchiveWorkbench } from "@/components/ArchiveWorkbench";
import { KinoframeLogo } from "@/components/Icons";
import { getAspectRatioClass } from "@/lib/taxonomy";

export const dynamic = "force-dynamic";

const ARCHIVE_ITEMS = archiveSnapshot as ArchiveItem[];

function WorkbenchFallback() {
  return (
    <div className="min-h-screen w-full bg-[#09090B]">
      <div className="border-b border-white/[0.08] bg-[#09090B]/92">
        <div className="mx-auto flex h-14 w-full max-w-[2560px] items-center justify-between px-4 sm:px-6 2xl:px-8">
          <div className="flex items-center gap-2.5">
            <KinoframeLogo className="h-7 w-7" />
            <span className="font-mono text-[18px] font-bold tracking-[0.16em] text-[#FAF8F5]">
              KINOFRAME
            </span>
          </div>
        </div>
      </div>
      <div className="mx-auto w-full max-w-[2560px] px-2 py-2 sm:px-3 lg:px-4">
        <div className="grid grid-cols-1 items-start gap-1.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {ARCHIVE_ITEMS.slice(0, 18).map((item) => (
            <div
              key={item.id}
              className={`w-full overflow-hidden rounded-[2px] bg-[#111216] ${getAspectRatioClass(
                item.aspectRatio
              )}`}
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
