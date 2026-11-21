import React, { Suspense } from "react";
import archiveSnapshot from "@/data/archive-snapshot.json";
import type { ArchiveItem } from "@/types/archive";
import { ArchiveWorkbench } from "@/components/ArchiveWorkbench";
import { KinoframeLogo } from "@/components/Icons";
import { getAspectRatioClass } from "@/lib/taxonomy";

const ARCHIVE_ITEMS = archiveSnapshot as ArchiveItem[];

function WorkbenchFallback() {
  return (
    <div className="min-h-screen w-full bg-[#09090B]">
      <div className="border-b border-[#F4F1EA]/[0.07] bg-[#09090B]/88">
        <div className="mx-auto flex w-full max-w-[2560px] items-center gap-3 px-3 py-2.5 sm:px-5 lg:px-7">
          <KinoframeLogo className="h-6 w-6" />
          <span className="font-mono text-sm font-bold tracking-[0.18em] text-ivory">
            KINOFRAME
          </span>
        </div>
      </div>
      <div className="mx-auto w-full max-w-[2560px] px-3 py-3 sm:px-5 lg:px-7">
        <div className="columns-1 gap-3 sm:columns-2 md:columns-3 lg:columns-4 xl:columns-5 2xl:columns-6">
          {ARCHIVE_ITEMS.slice(0, 12).map((item) => (
            <div
              key={item.id}
              className={`mb-3 break-inside-avoid overflow-hidden rounded-[4px] bg-[#111216] ring-1 ring-[#F4F1EA]/[0.08] ${getAspectRatioClass(
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
  return (
    <Suspense fallback={<WorkbenchFallback />}>
      <ArchiveWorkbench items={ARCHIVE_ITEMS} />
    </Suspense>
  );
}
