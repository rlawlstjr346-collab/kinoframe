"use client";

import React, { useEffect } from "react";
import type { ArchiveItem } from "@/types/archive";
import {
  formatDuration,
  getCategoryLabel,
  getCountryLabel,
  resolveItemCategory,
  resolveItemCountry,
} from "@/lib/taxonomy";
import { CloseIcon, CompareIcon, ExternalLinkIcon } from "@/components/Icons";

interface CompareDrawerProps {
  allItems: ArchiveItem[];
  compareIds: string[];
  onClose: () => void;
  onReplaceSlot: (slotIndex: 0 | 1, itemId: string) => void;
  onClearCompare: () => void;
}

export function CompareDrawer({
  allItems,
  compareIds,
  onClose,
  onReplaceSlot,
  onClearCompare,
}: CompareDrawerProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const leftItem =
    allItems.find((i) => i.id === compareIds[0]) ?? allItems[0] ?? null;
  const rightItem =
    allItems.find((i) => i.id === compareIds[1]) ??
    allItems.find((i) => i.id !== leftItem?.id) ??
    allItems[1] ??
    null;

  const slots: Array<{
    index: 0 | 1;
    label: string;
    current: ArchiveItem | null;
  }> = [
    { index: 0, label: "FRAME A", current: leftItem },
    { index: 1, label: "FRAME B", current: rightItem },
  ];

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-[#050507]/92 p-3 backdrop-blur-xl sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="좌우 비주얼 비교"
      onClick={onClose}
    >
      <div
        className="flex max-h-[94vh] w-[96vw] max-w-[1800px] flex-col overflow-hidden rounded-xl border border-white/[0.1] bg-[#0E0F13] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] bg-[#0B0C0F] px-6 py-4">
          <div className="flex items-center gap-2.5">
            <CompareIcon className="h-5 w-5 text-[#E5A93B]" />
            <h2 className="text-[18px] font-bold text-[#FAF8F5]">
              좌우 비주얼 비교
            </h2>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClearCompare}
              className="rounded-full border border-white/[0.14] px-4 py-1.5 text-[14px] font-medium text-[#D8D4CA] hover:border-white/35 hover:text-white"
            >
              슬롯 초기화
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="비교 창 닫기"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#D8D4CA] hover:bg-white/[0.08] hover:text-white"
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div className="grid flex-1 grid-cols-1 divide-y divide-white/[0.08] overflow-y-auto lg:grid-cols-2 lg:divide-x lg:divide-y-0">
          {slots.map(({ index, label, current }) => (
            <div key={label} className="flex flex-col gap-5 p-6">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-[13px] font-bold tracking-wider text-[#E5A93B]">
                  {label}
                </span>
                <select
                  aria-label={`${label} 작품 선택`}
                  value={current?.id ?? ""}
                  onChange={(e) => onReplaceSlot(index, e.target.value)}
                  className="max-w-[75%] truncate rounded-full border border-white/[0.14] bg-[#14161D] px-4 py-2 text-[14px] text-[#FAF8F5] focus:border-[#E5A93B] focus:outline-none"
                >
                  {allItems.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      [{opt.id}] {opt.titleKo} ({opt.year})
                    </option>
                  ))}
                </select>
              </div>

              {current && (
                <>
                  <div className="relative aspect-[16/10] w-full overflow-hidden rounded-lg bg-black ring-1 ring-white/[0.1]">
                    {current.mediaSource === "archive_mp4" &&
                    current.previewVideoUrl ? (
                      <video
                        src={current.previewVideoUrl}
                        poster={current.thumbnailUrl}
                        controls
                        muted
                        loop
                        playsInline
                        className="h-full w-full bg-black object-contain"
                      />
                    ) : (
                      <img
                        src={current.thumbnailUrl}
                        alt={current.titleKo}
                        className="h-full w-full object-contain"
                      />
                    )}
                  </div>

                  <div>
                    <p className="text-[14px] font-semibold text-[#E5A93B]">
                      {getCategoryLabel(resolveItemCategory(current))} ·{" "}
                      {getCountryLabel(resolveItemCountry(current))} ·{" "}
                      {current.year}
                    </p>
                    <h3 className="mt-1 text-[20px] font-bold text-[#FAF8F5]">
                      {current.titleKo}
                    </h3>
                    <p className="mt-1 text-[14px] text-[#C8C3B8]">
                      {current.brandOrSource} · {current.aspectRatio} ·{" "}
                      {formatDuration(current.durationSec)}
                    </p>
                  </div>

                  <div className="flex h-12 w-full overflow-hidden rounded-lg ring-1 ring-white/10">
                    {current.palette.map((hex, i) => (
                      <div
                        key={`${current.id}-cmp-${i}`}
                        className="flex flex-1 items-end justify-center pb-1"
                        style={{ backgroundColor: hex }}
                        title={hex}
                      >
                        <span className="rounded bg-black/70 px-1.5 py-0.5 font-mono text-[11px] text-white">
                          {hex}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between border-t border-white/[0.08] pt-3 text-[14px] text-[#D0CBC0]">
                    <span>{current.licenseNote}</span>
                    <a
                      href={current.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-[#E5A93B] hover:underline"
                    >
                      원본 출처
                      <ExternalLinkIcon className="h-4 w-4" />
                    </a>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
