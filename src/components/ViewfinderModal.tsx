"use client";

import React, { useCallback, useEffect, useState } from "react";
import type {
  ArchiveItem,
  CompositionTag,
  OverlayVisibility,
  PersuasionTag,
} from "@/types/archive";
import { formatDuration } from "@/lib/taxonomy";
import { ViewfinderOverlay } from "@/components/ViewfinderOverlay";
import {
  BoardBookmarkIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  CompareIcon,
  ExternalLinkIcon,
  PlayIcon,
  ViewfinderIcon,
} from "@/components/Icons";

interface ViewfinderModalProps {
  item: ArchiveItem;
  hasPrev: boolean;
  hasNext: boolean;
  isInBoard: boolean;
  isInCompare: boolean;
  compareFull: boolean;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onToggleBoard: (id: string) => void;
  onToggleCompare: (id: string) => void;
  onSelectCompositionTag?: (tag: CompositionTag) => void;
  onSelectPersuasionTag?: (tag: PersuasionTag) => void;
}

const OFF_OVERLAY: OverlayVisibility = {
  perspective: false,
  thirds: false,
  symmetry: false,
  eyePath: false,
};

function getPrimaryOverlay(item: ArchiveItem): OverlayVisibility {
  return {
    perspective: item.viewfinder.primaryGrid === "perspective",
    thirds:
      item.viewfinder.primaryGrid === "thirds" ||
      item.viewfinder.primaryGrid === "golden",
    symmetry: item.viewfinder.primaryGrid === "symmetry",
    eyePath: true,
  };
}

const OPTIMAL_OVERLAY_OPACITY = 0.78;

export function ViewfinderModal({
  item,
  hasPrev,
  hasNext,
  isInBoard,
  isInCompare,
  compareFull,
  onClose,
  onPrev,
  onNext,
  onToggleBoard,
  onToggleCompare,
  onSelectCompositionTag,
  onSelectPersuasionTag,
}: ViewfinderModalProps) {
  // Default 100% OFF so users appreciate the clean original frame first
  const [overlay, setOverlay] = useState<OverlayVisibility>(OFF_OVERLAY);
  const [youtubeActive, setYoutubeActive] = useState<boolean>(false);
  const [copiedHex, setCopiedHex] = useState<string | null>(null);

  const isGridActive =
    overlay.perspective ||
    overlay.thirds ||
    overlay.symmetry ||
    overlay.eyePath;

  // Reset to clean original frame on item switch
  useEffect(() => {
    setOverlay(OFF_OVERLAY);
    setYoutubeActive(false);
    setCopiedHex(null);
  }, [item]);

  const handleToggleMasterGrid = useCallback(() => {
    setOverlay((prev) => {
      const anyOn =
        prev.perspective || prev.thirds || prev.symmetry || prev.eyePath;
      return anyOn ? OFF_OVERLAY : getPrimaryOverlay(item);
    });
  }, [item]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && hasPrev) onPrev();
      if (e.key === "ArrowRight" && hasNext) onNext();
      if (
        (e.key === "g" || e.key === "G") &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        e.preventDefault();
        handleToggleMasterGrid();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, onPrev, onNext, hasPrev, hasNext, handleToggleMasterGrid]);

  const toggleLayer = (key: keyof OverlayVisibility) => {
    setOverlay((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleCopyHex = async (hex: string) => {
    try {
      await navigator.clipboard.writeText(hex);
      setCopiedHex(hex);
      window.setTimeout(() => setCopiedHex(null), 1600);
    } catch {
      setCopiedHex(hex);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#09090B]/94 p-2.5 backdrop-blur-md sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label={`${item.titleKo} 라이트박스`}
      onClick={onClose}
    >
      <div
        className="flex max-h-[94vh] w-full max-w-[1440px] flex-col overflow-hidden rounded-[6px] border border-[#F4F1EA]/[0.1] bg-[#0D0E12] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Minimal Top Utility Bar */}
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F4F1EA]/[0.08] bg-[#09090B] px-4 py-2.5">
          {/* Left: Single Master Grid Toggle + Quiet Mini Layer Chips when ON */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleToggleMasterGrid}
              aria-pressed={isGridActive}
              className={`inline-flex items-center gap-1.5 rounded-[4px] border px-2.5 py-1 font-mono text-[11px] font-medium transition-colors ${
                isGridActive
                  ? "border-[#D99B26] bg-[#D99B26]/18 text-[#D99B26]"
                  : "border-[#F4F1EA]/[0.12] bg-[#111216] text-ivory hover:border-[#D99B26]/60 hover:text-[#D99B26]"
              }`}
            >
              <ViewfinderIcon className="h-3.5 w-3.5" />
              <span>{isGridActive ? "구도 그리드 끄기 (G)" : "구도 그리드 보기 (G)"}</span>
            </button>

            {isGridActive && (
              <div className="flex items-center gap-1" role="group" aria-label="구도 레이어 세부 전환">
                {(
                  [
                    ["perspective", "투시"],
                    ["thirds", "삼분할"],
                    ["symmetry", "대칭"],
                    ["eyePath", "시선"],
                  ] as Array<[keyof OverlayVisibility, string]>
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleLayer(key)}
                    aria-pressed={overlay[key]}
                    className={`rounded-[3px] px-2 py-0.5 font-mono text-[10px] transition-colors ${
                      overlay[key]
                        ? "bg-[#D99B26]/20 text-[#D99B26]"
                        : "text-silver/60 hover:bg-[#F4F1EA]/[0.06] hover:text-ivory"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right: Telemetry + Prev / Next / Close */}
          <div className="flex items-center gap-1.5">
            <span className="mr-2 hidden font-mono text-[11px] text-silver/70 sm:inline">
              {item.id} · {item.aspectRatio} · {formatDuration(item.durationSec)}
            </span>
            <button
              type="button"
              onClick={onPrev}
              disabled={!hasPrev}
              aria-label="이전 작품"
              className="rounded-[4px] border border-[#F4F1EA]/[0.1] bg-[#111216] p-1.5 text-silver transition-colors hover:border-[#F4F1EA]/25 hover:text-ivory disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={!hasNext}
              aria-label="다음 작품"
              className="rounded-[4px] border border-[#F4F1EA]/[0.1] bg-[#111216] p-1.5 text-silver transition-colors hover:border-[#F4F1EA]/25 hover:text-ivory disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronRightIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="라이트박스 닫기"
              className="ml-1 rounded-[4px] border border-[#F4F1EA]/[0.1] bg-[#111216] p-1.5 text-silver transition-colors hover:border-[#D99B26]/60 hover:text-ivory"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Main Lightbox Split: Large Cinema Viewer (8 cols) + Slim Editorial Inspector (4 cols) */}
        <div className="grid flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-12">
          {/* Left Cinema Stage */}
          <div className="relative flex min-h-[320px] flex-col items-center justify-center bg-[#050507] p-4 lg:col-span-8 lg:min-h-[600px] lg:border-r lg:border-[#F4F1EA]/[0.08] lg:p-8">
            <div className="relative flex w-full items-center justify-center overflow-hidden">
              {item.mediaSource === "archive_mp4" && item.previewVideoUrl ? (
                <div className="relative inline-flex max-w-full items-center justify-center">
                  <video
                    src={item.previewVideoUrl}
                    poster={item.thumbnailUrl}
                    controls
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="max-h-[74vh] w-auto max-w-full bg-black object-contain"
                  />
                  <ViewfinderOverlay
                    viewfinder={item.viewfinder}
                    visibility={overlay}
                    opacity={OPTIMAL_OVERLAY_OPACITY}
                  />
                </div>
              ) : item.mediaSource === "youtube_embed" && item.youtubeId ? (
                youtubeActive ? (
                  <div className="relative aspect-video w-full max-w-4xl">
                    <iframe
                      src={`https://www.youtube-nocookie.com/embed/${item.youtubeId}?autoplay=1&rel=0`}
                      title={item.titleKo}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="h-full w-full border-0"
                    />
                  </div>
                ) : (
                  <div className="relative aspect-video w-full max-w-4xl overflow-hidden bg-black">
                    <img
                      src={item.thumbnailUrl}
                      alt={item.titleKo}
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setYoutubeActive(true)}
                      className="absolute inset-0 flex items-center justify-center bg-[#09090B]/25 transition-colors hover:bg-[#09090B]/10"
                      aria-label="YouTube 아카이브 영상 재생"
                    >
                      <span className="inline-flex items-center gap-2 rounded-full border border-[#D99B26]/80 bg-[#09090B]/88 px-4 py-2 font-mono text-xs font-semibold text-[#D99B26] shadow-lg backdrop-blur-sm">
                        <PlayIcon className="h-4 w-4" />
                        YOUTUBE PLAY
                      </span>
                    </button>
                    <ViewfinderOverlay
                      viewfinder={item.viewfinder}
                      visibility={overlay}
                      opacity={OPTIMAL_OVERLAY_OPACITY}
                    />
                  </div>
                )
              ) : (
                <div className="relative inline-flex max-w-full items-center justify-center">
                  <img
                    src={item.thumbnailUrl}
                    alt={item.titleKo}
                    className="max-h-[74vh] w-auto max-w-full object-contain"
                  />
                  <ViewfinderOverlay
                    viewfinder={item.viewfinder}
                    visibility={overlay}
                    opacity={OPTIMAL_OVERLAY_OPACITY}
                  />
                </div>
              )}
            </div>

            {item.mediaSource === "youtube_embed" && youtubeActive && (
              <button
                type="button"
                onClick={() => setYoutubeActive(false)}
                className="mt-3 font-mono text-[11px] text-[#D99B26] underline underline-offset-4 hover:text-ivory"
              >
                스틸 프레임으로 돌아가 구도 그리드 보기
              </button>
            )}
          </div>

          {/* Right Slim Editorial Inspector (3 Compressed Sections) */}
          <aside className="flex flex-col justify-between bg-[#0D0E12] p-5 lg:col-span-4 lg:p-6">
            <div className="space-y-6">
              {/* 1. Editorial Header */}
              <div className="border-b border-[#F4F1EA]/[0.08] pb-5">
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#D99B26]">
                  {item.mediaType} · {item.year} · {item.brandOrSource}
                </p>
                <h2 className="mt-2 text-lg font-semibold leading-snug tracking-tight text-ivory">
                  {item.titleKo}
                </h2>
                <p className="mt-1 font-mono text-xs text-silver/75">
                  {item.originalTitle}
                </p>
                <p className="mt-2 font-mono text-[10px] text-silver/55">
                  {item.era} · {item.licenseNote}
                </p>
              </div>

              {/* 2. Wide 5-Color Strip Bar */}
              <section className="border-b border-[#F4F1EA]/[0.08] pb-5">
                <div className="mb-2.5 flex items-center justify-between">
                  <h3 className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-silver">
                    COLOR PALETTE
                  </h3>
                  <span className="font-mono text-[10px] text-silver/70">
                    {copiedHex ? (
                      <span className="inline-flex items-center gap-1 text-[#D99B26]">
                        <CheckIcon className="h-3 w-3" />
                        {copiedHex} 복사됨
                      </span>
                    ) : (
                      "클릭하여 HEX 복사"
                    )}
                  </span>
                </div>

                <div className="flex h-11 w-full overflow-hidden rounded-[4px] ring-1 ring-[#F4F1EA]/12">
                  {item.palette.map((hex, idx) => (
                    <button
                      key={`${item.id}-swatch-${idx}`}
                      type="button"
                      onClick={() => handleCopyHex(hex)}
                      title={`${hex} 복사`}
                      aria-label={`컬러 ${hex} 복사`}
                      className="group/swatch relative flex-1 transition-all duration-200 hover:flex-[1.55] focus-visible:flex-[1.55]"
                      style={{ backgroundColor: hex }}
                    >
                      <span className="absolute inset-x-0 bottom-0 bg-[#09090B]/78 py-0.5 text-center font-mono text-[9px] text-ivory opacity-0 transition-opacity group-hover/swatch:opacity-100">
                        {hex}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="mt-2 grid grid-cols-5 gap-1">
                  {item.palette.map((hex, idx) => (
                    <button
                      key={`${item.id}-code-${idx}`}
                      type="button"
                      onClick={() => handleCopyHex(hex)}
                      className={`text-center font-mono text-[10px] transition-colors ${
                        copiedHex === hex
                          ? "font-semibold text-[#D99B26]"
                          : "text-silver/70 hover:text-ivory"
                      }`}
                    >
                      {hex}
                    </button>
                  ))}
                </div>
              </section>

              {/* 3. Visual & Ad Insight (Clean Editorial Dividers, Zero Nested Boxes) */}
              <section className="space-y-4">
                <h3 className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-silver">
                  VISUAL &amp; AD INSIGHT
                </h3>

                <div className="space-y-3.5 divide-y divide-[#F4F1EA]/[0.07]">
                  <div>
                    <p className="font-mono text-[10px] font-semibold tracking-[0.14em] text-[#D99B26]">
                      3S HOOK
                    </p>
                    <p className="mt-1 text-[13px] leading-relaxed text-ivory/95">
                      {item.breakdown.hook3s}
                    </p>
                  </div>

                  <div className="pt-3.5">
                    <p className="font-mono text-[10px] font-semibold tracking-[0.14em] text-[#D99B26]">
                      FRAMING
                    </p>
                    <p className="mt-1 text-[13px] leading-relaxed text-ivory/90">
                      {item.breakdown.framing}
                    </p>
                  </div>

                  <div className="pt-3.5">
                    <p className="font-mono text-[10px] font-semibold tracking-[0.14em] text-[#D99B26]">
                      INSIGHT
                    </p>
                    <p className="mt-1 text-[13px] leading-relaxed text-ivory/90">
                      {item.breakdown.marketingApply}
                    </p>
                  </div>
                </div>

                {/* Clickable Mini Taxonomy Filter Chips */}
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {item.compositionTags.map((tag) => (
                    <button
                      key={`m-c-${tag}`}
                      type="button"
                      onClick={() => onSelectCompositionTag?.(tag)}
                      title={`'${tag}' 구도 필터 적용`}
                      className="rounded-[3px] border border-[#F4F1EA]/[0.12] bg-[#111216] px-2 py-0.5 text-[11px] text-ivory/90 transition-colors hover:border-ivory hover:bg-ivory hover:text-[#09090B]"
                    >
                      {tag}
                    </button>
                  ))}
                  {item.persuasionTags.map((tag) => (
                    <button
                      key={`m-p-${tag}`}
                      type="button"
                      onClick={() => onSelectPersuasionTag?.(tag)}
                      title={`'${tag}' 설득 훅 필터 적용`}
                      className="rounded-[3px] border border-[#D99B26]/35 bg-[#D99B26]/10 px-2 py-0.5 text-[11px] text-[#D99B26] transition-colors hover:border-[#D99B26] hover:bg-[#D99B26] hover:text-[#09090B]"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </section>
            </div>

            {/* Bottom Single-Row Action Bar */}
            <div className="mt-6 flex items-center gap-2 border-t border-[#F4F1EA]/[0.08] pt-4">
              <button
                type="button"
                onClick={() => onToggleBoard(item.id)}
                className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-[4px] px-3 py-2 font-mono text-xs transition-colors ${
                  isInBoard
                    ? "bg-[#D99B26] font-semibold text-[#09090B]"
                    : "border border-[#F4F1EA]/[0.12] bg-[#111216] text-ivory hover:border-[#D99B26]/60"
                }`}
              >
                <BoardBookmarkIcon className="h-3.5 w-3.5" filled={isInBoard} />
                <span>{isInBoard ? "보드 담김" : "보드 담기"}</span>
              </button>

              <button
                type="button"
                onClick={() => onToggleCompare(item.id)}
                disabled={!isInCompare && compareFull}
                className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-[4px] px-3 py-2 font-mono text-xs transition-colors ${
                  isInCompare
                    ? "border border-[#D99B26] bg-[#D99B26]/20 text-[#D99B26]"
                    : compareFull
                    ? "cursor-not-allowed border border-[#F4F1EA]/[0.08] text-silver/40"
                    : "border border-[#F4F1EA]/[0.12] bg-[#111216] text-ivory hover:border-[#D99B26]/60"
                }`}
              >
                <CompareIcon className="h-3.5 w-3.5" />
                <span>{isInCompare ? "비교중" : "비교 추가"}</span>
              </button>

              <a
                href={item.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1 rounded-[4px] border border-[#F4F1EA]/[0.12] bg-[#111216] px-3 py-2 font-mono text-xs text-silver transition-colors hover:border-[#F4F1EA]/30 hover:text-ivory"
              >
                <span>원본 출처</span>
                <ExternalLinkIcon className="h-3.5 w-3.5" />
              </a>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
