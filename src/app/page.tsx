import React, { Suspense } from "react";
import archiveSnapshot from "@/data/archive-snapshot.json";
import type { ArchiveItem } from "@/types/archive";
import { ArchiveWorkbench } from "@/components/ArchiveWorkbench";
import { KinoframeLogo } from "@/components/Icons";

const ARCHIVE_ITEMS = archiveSnapshot as ArchiveItem[];

function WorkbenchFallback() {
  return (
    <div className="mx-auto flex min-h-screen max-w-[1440px] flex-col px-4 py-6 sm:px-6">
      <div className="flex items-center gap-3 border-b border-rim pb-4">
        <KinoframeLogo className="h-8 w-8" />
        <span className="font-mono text-base font-bold tracking-[0.18em] text-ivory">
          KINOFRAME
        </span>
      </div>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ARCHIVE_ITEMS.slice(0, 8).map((item) => (
          <div
            key={item.id}
            className="slide-mount-border overflow-hidden rounded-lg bg-darkroom-mount p-3"
          >
            <div className="font-mono text-xs text-amber-kodak">{item.id}</div>
            <div className="mt-2 aspect-[4/3] w-full rounded bg-darkroom-base" />
            <div className="mt-3 text-sm font-semibold text-ivory">
              {item.titleKo}
            </div>
          </div>
        ))}
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
