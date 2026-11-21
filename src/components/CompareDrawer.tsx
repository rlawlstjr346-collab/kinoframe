"use client";

import React, { useEffect, useState } from "react";
import type { ArchiveItem, OverlayVisibility } from "@/types/archive";
import { formatDuration } from "@/lib/taxonomy";
import { ViewfinderOverlay } from "@/components/ViewfinderOverlay";
import {
  CloseIcon,
  CompareIcon,
  EyePathIcon,
  PerspectiveIcon,
  SymmetryIcon,
  ThirdsGridIcon,
} from "@/components/Icons";

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
  const [overlay, setOverlay] = useState<OverlayVisibility>({
    perspective: true,
    thirds: false,
    symmetry: false,
    eyePath: true,
  });
  const [opacity, setOpacity] = useState<number>(0.85);

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

  const itemMap = new Map(allItems.map((i) => [i.id, i]));
  const leftItem = compareIds[0] ? itemMap.get(compareIds[0]) ?? null : null;
  const rightItem = compareIds[1] ? itemMap.get(compareIds[1]) ?? null : null;

  const toggleLayer = (key: keyof OverlayVisibility) => {
    setOverlay((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const sharedComposition =
    leftItem && rightItem
      ? leftItem.compositionTags.filter((t) =>
          rightItem.compositionTags.includes(t)
        )
      : [];
  const sharedPersuasion =
    leftItem && rightItem
      ? leftItem.persuasionTags.filter((t) =>
          rightItem.persuasionTags.includes(t)
        )
      : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-darkroom-base/92 p-3 backdrop-blur-md sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="좌우 교차 구도 비교 뷰"
      onClick={onClose}
    >
      <div
        className="slide-mount-border flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-darkroom-mount"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-rim bg-darkroom-recessed px-4 py-3">
          <div className="flex items-center gap-2.5">
            <CompareIcon className="h-4 w-4 text-amber-kodak" />
            <h2 className="font-mono text-sm font-semibold tracking-wider text-ivory">
              SIDE-BY-SIDE COMPARE (좌우 구도·설득 교차 비교)
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClearCompare}
              className="rounded border border-rim bg-darkroom-mount px-2.5 py-1 font-mono text-xs text-silver hover:border-rim-strong hover:text-ivory"
            >
              슬롯 초기화
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="비교 뷰 닫기"
              className="rounded border border-rim bg-darkroom-mount p-1.5 text-silver hover:border-amber-kodak hover:text-ivory"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Shared SVG Overlay Control Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rim bg-darkroom-base px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 font-mono text-[11px] text-silver">
              동기화 가이드:
            </span>
            <button
              type="button"
              onClick={() => toggleLayer("perspective")}
              className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs ${
                overlay.perspective
                  ? "border border-amber-kodak bg-amber-kodak/20 text-amber-kodak"
                  : "border border-rim bg-darkroom-mount text-silver hover:text-ivory"
              }`}
            >
              <PerspectiveIcon className="h-3.5 w-3.5" />
              1점 투시
            </button>
            <button
              type="button"
              onClick={() => toggleLayer("thirds")}
              className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs ${
                overlay.thirds
                  ? "border border-amber-kodak bg-amber-kodak/20 text-amber-kodak"
                  : "border border-rim bg-darkroom-mount text-silver hover:text-ivory"
              }`}
            >
              <ThirdsGridIcon className="h-3.5 w-3.5" />
              삼분할
            </button>
            <button
              type="button"
              onClick={() => toggleLayer("symmetry")}
              className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs ${
                overlay.symmetry
                  ? "border border-amber-kodak bg-amber-kodak/20 text-amber-kodak"
                  : "border border-rim bg-darkroom-mount text-silver hover:text-ivory"
              }`}
            >
              <SymmetryIcon className="h-3.5 w-3.5" />
              대칭축
            </button>
            <button
              type="button"
              onClick={() => toggleLayer("eyePath")}
              className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs ${
                overlay.eyePath
                  ? "border border-amber-kodak bg-amber-kodak/20 text-amber-kodak"
                  : "border border-rim bg-darkroom-mount text-silver hover:text-ivory"
              }`}
            >
              <EyePathIcon className="h-3.5 w-3.5" />
              시선 동선
            </button>
          </div>

          <label className="flex items-center gap-2 font-mono text-[11px] text-silver">
            <span>투명도</span>
            <input
              type="range"
              min={20}
              max={100}
              step={5}
              value={Math.round(opacity * 100)}
              onChange={(e) => setOpacity(Number(e.target.value) / 100)}
              className="h-1.5 w-20 cursor-pointer accent-amber-kodak"
            />
            <span className="w-8 text-right text-ivory">
              {Math.round(opacity * 100)}%
            </span>
          </label>
        </div>

        {/* Comparison Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {/* Shared Taxonomy Insight Banner */}
          {leftItem && rightItem && (
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-amber-kodak/30 bg-amber-kodak/10 px-3.5 py-2.5 text-xs">
              <span className="font-mono font-semibold text-amber-kodak">
                교차 공통점:
              </span>
              {sharedComposition.length > 0 || sharedPersuasion.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {sharedComposition.map((t) => (
                    <span
                      key={`sc-${t}`}
                      className="rounded border border-rim-strong bg-darkroom-base px-2 py-0.5 text-ivory"
                    >
                      구도 · {t}
                    </span>
                  ))}
                  {sharedPersuasion.map((t) => (
                    <span
                      key={`sp-${t}`}
                      className="rounded border border-amber-kodak/50 bg-darkroom-base px-2 py-0.5 text-amber-kodak"
                    >
                      설득 · {t}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-ivory">
                  서로 다른 구도·설득 문법의 대비 레퍼런스입니다 (시대 격차{" "}
                  {Math.abs(leftItem.year - rightItem.year)}년).
                </span>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {([0, 1] as const).map((slot) => {
              const current = slot === 0 ? leftItem : rightItem;
              return (
                <div
                  key={`compare-slot-${slot}`}
                  className="flex flex-col gap-3 rounded-lg border border-rim bg-darkroom-base p-3.5"
                >
                  {/* Slot Selector */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] font-semibold text-amber-kodak">
                      FRAME {slot === 0 ? "A" : "B"}
                    </span>
                    <select
                      aria-label={`비교 슬롯 ${slot === 0 ? "A" : "B"} 작품 선택`}
                      value={current?.id ?? ""}
                      onChange={(e) => {
                        if (e.target.value) {
                          onReplaceSlot(slot, e.target.value);
                        }
                      }}
                      className="max-w-[78%] rounded border border-rim bg-darkroom-mount px-2.5 py-1 text-xs text-ivory"
                    >
                      <option value="">작품을 선택하세요</option>
                      {allItems.map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          [{candidate.id}] {candidate.titleKo} ({candidate.year})
                        </option>
                      ))}
                    </select>
                  </div>

                  {current ? (
                    <>
                      <div className="relative aspect-[4/3] w-full overflow-hidden rounded border border-rim bg-black">
                        <img
                          src={current.thumbnailUrl}
                          alt={current.titleKo}
                          className="h-full w-full object-contain"
                        />
                        <ViewfinderOverlay
                          viewfinder={current.viewfinder}
                          visibility={overlay}
                          opacity={opacity}
                          compact
                        />
                      </div>

                      <div className="space-y-1">
                        <h3 className="text-sm font-semibold text-ivory">
                          {current.titleKo}
                        </h3>
                        <p className="font-mono text-[11px] text-silver">
                          {current.brandOrSource} · {current.year} ·{" "}
                          {current.mediaType} · {current.aspectRatio} ·{" "}
                          {formatDuration(current.durationSec)}
                        </p>
                      </div>

                      {/* Palette Bar */}
                      <div className="grid grid-cols-5 gap-1">
                        {current.palette.map((hex, idx) => (
                          <div
                            key={`${current.id}-cp-${idx}`}
                            className="flex flex-col items-center rounded border border-rim bg-darkroom-mount p-1"
                          >
                            <span
                              className="h-4 w-full rounded-[2px]"
                              style={{ backgroundColor: hex }}
                            />
                            <span className="mt-1 font-mono text-[9px] text-silver">
                              {hex}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Breakdown Comparison Blocks */}
                      <div className="space-y-2 text-xs">
                        <div className="rounded border border-rim bg-darkroom-mount p-2.5">
                          <p className="font-mono text-[10px] text-amber-kodak">
                            초반 3초 훅
                          </p>
                          <p className="mt-1 leading-relaxed text-ivory">
                            {current.breakdown.hook3s}
                          </p>
                        </div>
                        <div className="rounded border border-rim bg-darkroom-mount p-2.5">
                          <p className="font-mono text-[10px] text-amber-kodak">
                            구도·명암 원리
                          </p>
                          <p className="mt-1 leading-relaxed text-ivory">
                            {current.breakdown.framing}
                          </p>
                        </div>
                        <div className="rounded border border-amber-kodak/25 bg-amber-kodak/8 p-2.5">
                          <p className="font-mono text-[10px] text-amber-kodak">
                            실무 적용 포인트
                          </p>
                          <p className="mt-1 leading-relaxed text-ivory">
                            {current.breakdown.marketingApply}
                          </p>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex min-h-[260px] flex-col items-center justify-center rounded border border-dashed border-rim p-6 text-center text-xs text-silver">
                      상단 선택창에서 비교할 두 번째 작품을 고르면
                      <br />
                      구도 오버레이와 3초 설득 공식을 나란히 대조할 수 있습니다.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
