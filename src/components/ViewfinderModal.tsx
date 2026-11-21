"use client";

import React, { useEffect, useRef, useState } from "react";
import type { ArchiveItem, OverlayVisibility } from "@/types/archive";
import { formatDuration, parseTimestampToSeconds } from "@/lib/taxonomy";
import { ViewfinderOverlay } from "@/components/ViewfinderOverlay";
import {
  BoardBookmarkIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  CompareIcon,
  CopyIcon,
  ExternalLinkIcon,
  EyePathIcon,
  FilmStripIcon,
  PerspectiveIcon,
  PlayIcon,
  SymmetryIcon,
  ThirdsGridIcon,
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
}

function getInitialOverlay(item: ArchiveItem): OverlayVisibility {
  return {
    perspective: item.viewfinder.primaryGrid === "perspective",
    thirds:
      item.viewfinder.primaryGrid === "thirds" ||
      item.viewfinder.primaryGrid === "golden",
    symmetry: item.viewfinder.primaryGrid === "symmetry",
    eyePath: true,
  };
}

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
}: ViewfinderModalProps) {
  const [overlay, setOverlay] = useState<OverlayVisibility>(() =>
    getInitialOverlay(item)
  );
  const [opacity, setOpacity] = useState<number>(0.85);
  const [activeBeatIndex, setActiveBeatIndex] = useState<number | null>(null);
  const [youtubeActive, setYoutubeActive] = useState<boolean>(false);
  const [copiedHex, setCopiedHex] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    setOverlay(getInitialOverlay(item));
    setActiveBeatIndex(null);
    setYoutubeActive(false);
    setCopiedHex(null);
  }, [item]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && hasPrev) onPrev();
      if (e.key === "ArrowRight" && hasNext) onNext();
    };
    window.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, onPrev, onNext, hasPrev, hasNext]);

  const toggleLayer = (key: keyof OverlayVisibility) => {
    setOverlay((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSelectBeat = (idx: number) => {
    const nextIdx = activeBeatIndex === idx ? null : idx;
    setActiveBeatIndex(nextIdx);
    if (nextIdx !== null) {
      const beat = item.beats[nextIdx];
      const sec = parseTimestampToSeconds(beat.timeOrZone);
      if (sec !== null && videoRef.current) {
        videoRef.current.currentTime = sec;
        videoRef.current.play().catch(() => {});
      }
    }
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

  const activeBeat = activeBeatIndex !== null ? item.beats[activeBeatIndex] : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-darkroom-base/92 p-3 backdrop-blur-md sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`${item.titleKo} 뷰파인더 스튜디오`}
      onClick={onClose}
    >
      <div
        className="slide-mount-border flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-darkroom-mount"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Studio Header Bar */}
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-rim bg-darkroom-recessed px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="rounded border border-amber-kodak/40 bg-amber-kodak/15 px-2 py-0.5 font-mono text-xs font-semibold text-amber-kodak">
              {item.id}
            </span>
            <h2 className="truncate text-base font-semibold tracking-tight text-ivory sm:text-lg">
              {item.titleKo}
            </h2>
            <span className="hidden font-mono text-xs text-silver md:inline">
              {item.brandOrSource} · {item.year} · {item.mediaType}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onPrev}
              disabled={!hasPrev}
              aria-label="이전 작품"
              className="rounded border border-rim bg-darkroom-mount p-1.5 text-silver transition-colors hover:border-rim-strong hover:text-ivory disabled:cursor-not-allowed disabled:opacity-35"
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={!hasNext}
              aria-label="다음 작품"
              className="rounded border border-rim bg-darkroom-mount p-1.5 text-silver transition-colors hover:border-rim-strong hover:text-ivory disabled:cursor-not-allowed disabled:opacity-35"
            >
              <ChevronRightIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="뷰파인더 닫기"
              className="ml-1 rounded border border-rim bg-darkroom-mount p-1.5 text-silver transition-colors hover:border-amber-kodak/60 hover:text-ivory"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Scrollable Studio Body */}
        <div className="grid flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-12">
          {/* Left Stage: Optical Viewfinder + Overlay Controls + 4-Cut Contact Sheet */}
          <div className="flex flex-col border-b border-rim bg-darkroom-base p-4 lg:col-span-7 lg:border-b-0 lg:border-r lg:p-5">
            {/* Overlay Toggle Bar */}
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rim bg-darkroom-mount px-3 py-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => toggleLayer("perspective")}
                  className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                    overlay.perspective
                      ? "border border-amber-kodak bg-amber-kodak/20 text-amber-kodak"
                      : "border border-rim bg-darkroom-base text-silver hover:text-ivory"
                  }`}
                >
                  <PerspectiveIcon className="h-3.5 w-3.5" />
                  1점 투시 소실점
                </button>
                <button
                  type="button"
                  onClick={() => toggleLayer("thirds")}
                  className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                    overlay.thirds
                      ? "border border-amber-kodak bg-amber-kodak/20 text-amber-kodak"
                      : "border border-rim bg-darkroom-base text-silver hover:text-ivory"
                  }`}
                >
                  <ThirdsGridIcon className="h-3.5 w-3.5" />
                  삼분할 격자
                </button>
                <button
                  type="button"
                  onClick={() => toggleLayer("symmetry")}
                  className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                    overlay.symmetry
                      ? "border border-amber-kodak bg-amber-kodak/20 text-amber-kodak"
                      : "border border-rim bg-darkroom-base text-silver hover:text-ivory"
                  }`}
                >
                  <SymmetryIcon className="h-3.5 w-3.5" />
                  대칭축
                </button>
                <button
                  type="button"
                  onClick={() => toggleLayer("eyePath")}
                  className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                    overlay.eyePath
                      ? "border border-amber-kodak bg-amber-kodak/20 text-amber-kodak"
                      : "border border-rim bg-darkroom-base text-silver hover:text-ivory"
                  }`}
                >
                  <EyePathIcon className="h-3.5 w-3.5" />
                  1→2→3 시선 동선
                </button>
              </div>

              {/* Opacity Slider */}
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
                  aria-label="구도 가이드 오버레이 투명도"
                />
                <span className="w-8 text-right text-ivory">
                  {Math.round(opacity * 100)}%
                </span>
              </label>
            </div>

            {/* Main Optical Frame Container */}
            <div className="relative flex min-h-[260px] flex-1 items-center justify-center overflow-hidden rounded-lg border border-rim bg-[#050507]">
              <div className="relative w-full overflow-hidden">
                {item.mediaSource === "archive_mp4" && item.previewVideoUrl ? (
                  <video
                    ref={videoRef}
                    src={item.previewVideoUrl}
                    poster={item.thumbnailUrl}
                    controls
                    muted
                    playsInline
                    className="max-h-[46vh] w-full object-contain bg-black"
                  />
                ) : item.mediaSource === "youtube_embed" && item.youtubeId ? (
                  youtubeActive ? (
                    <div className="relative aspect-video w-full">
                      <iframe
                        src={`https://www.youtube-nocookie.com/embed/${item.youtubeId}?autoplay=1&rel=0`}
                        title={item.titleKo}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        className="h-full w-full border-0"
                      />
                    </div>
                  ) : (
                    <div className="relative aspect-video w-full">
                      <img
                        src={item.thumbnailUrl}
                        alt={item.titleKo}
                        className="h-full w-full object-cover"
                        style={
                          activeBeat
                            ? { objectPosition: activeBeat.focusCrop }
                            : undefined
                        }
                      />
                      <button
                        type="button"
                        onClick={() => setYoutubeActive(true)}
                        className="absolute inset-0 flex items-center justify-center bg-darkroom-base/30 transition-colors hover:bg-darkroom-base/15"
                        aria-label="YouTube 아카이브 영상 재생"
                      >
                        <span className="inline-flex items-center gap-2 rounded-full border border-amber-kodak bg-darkroom-base/90 px-4 py-2 font-mono text-xs font-semibold text-amber-kodak shadow-lg">
                          <PlayIcon className="h-4 w-4" />
                          YOUTUBE ARCHIVE PLAY
                        </span>
                      </button>
                    </div>
                  )
                ) : (
                  <div className="relative flex items-center justify-center">
                    <img
                      src={item.thumbnailUrl}
                      alt={item.titleKo}
                      className="max-h-[48vh] w-full object-contain transition-all duration-300"
                      style={
                        activeBeat
                          ? { objectPosition: activeBeat.focusCrop }
                          : undefined
                      }
                    />
                  </div>
                )}

                {/* Precision Inline SVG Composition Guide Overlay */}
                {!youtubeActive && (
                  <ViewfinderOverlay
                    viewfinder={item.viewfinder}
                    visibility={overlay}
                    opacity={opacity}
                    activeFocusCrop={activeBeat?.focusCrop ?? null}
                  />
                )}
              </div>
            </div>

            {/* Optical Telemetry Readout Bar */}
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-silver">
              <span>
                VP [{item.viewfinder.vanishingPoint[0]}%,{" "}
                {item.viewfinder.vanishingPoint[1]}%] · PRIMARY GRID:{" "}
                <strong className="text-amber-kodak uppercase">
                  {item.viewfinder.primaryGrid}
                </strong>
              </span>
              {item.mediaSource === "youtube_embed" && youtubeActive && (
                <button
                  type="button"
                  onClick={() => setYoutubeActive(false)}
                  className="text-amber-kodak underline underline-offset-4 hover:text-ivory"
                >
                  정지 스틸로 돌아가 구도 오버레이 보기
                </button>
              )}
              <span>
                {item.aspectRatio} · {formatDuration(item.durationSec)}
              </span>
            </div>

            {/* 4-Cut 35mm Film Contact Sheet */}
            <section className="mt-4 overflow-hidden rounded-lg border border-rim bg-darkroom-mount">
              <div className="sprocket-strip h-2.5 w-full border-b border-rim bg-darkroom-base" />
              <div className="p-3">
                <div className="mb-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FilmStripIcon className="h-4 w-4 text-amber-kodak" />
                    <h3 className="font-mono text-xs font-semibold tracking-wider text-ivory">
                      4-CUT CONTACT SHEET (밀착 인화 비트 분석)
                    </h3>
                  </div>
                  {activeBeat && (
                    <button
                      type="button"
                      onClick={() => setActiveBeatIndex(null)}
                      className="font-mono text-[11px] text-amber-kodak hover:underline"
                    >
                      포커스 해제
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {item.beats.map((beat, idx) => {
                    const isSelected = activeBeatIndex === idx;
                    return (
                      <button
                        key={`${item.id}-beat-${idx}`}
                        type="button"
                        onClick={() => handleSelectBeat(idx)}
                        className={`group flex flex-col overflow-hidden rounded border text-left transition-all ${
                          isSelected
                            ? "border-amber-kodak bg-amber-kodak/12"
                            : "border-rim bg-darkroom-base hover:border-rim-strong"
                        }`}
                      >
                        <div className="relative aspect-[4/3] w-full overflow-hidden bg-black">
                          <img
                            src={item.thumbnailUrl}
                            alt={`${beat.label} 포커스 컷`}
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                            style={{ objectPosition: beat.focusCrop }}
                          />
                          <span className="absolute left-1.5 top-1 rounded bg-darkroom-base/85 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-amber-kodak">
                            0{idx + 1}
                          </span>
                          <span className="absolute bottom-1 right-1 rounded bg-darkroom-base/85 px-1.5 py-0.5 font-mono text-[9px] text-ivory">
                            {beat.timeOrZone}
                          </span>
                        </div>
                        <div className="p-2">
                          <p className="truncate text-xs font-semibold text-ivory">
                            {beat.label}
                          </p>
                          <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-silver">
                            {beat.noteKo}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="sprocket-strip h-2.5 w-full border-t border-rim bg-darkroom-base" />
            </section>
          </div>

          {/* Right Rail: Breakdown, Palette, Metadata & Actions */}
          <div className="flex flex-col gap-5 bg-darkroom-mount p-4 lg:col-span-5 lg:p-5">
            {/* Original Title & Action Buttons */}
            <div className="space-y-3 border-b border-rim pb-4">
              <div>
                <p className="font-mono text-xs text-silver">
                  {item.originalTitle}
                </p>
                <p className="mt-1 text-xs text-silver">
                  {item.brandOrSource} · {item.year} ({item.era}) ·{" "}
                  {item.licenseNote}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onToggleBoard(item.id)}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    isInBoard
                      ? "bg-amber-kodak text-darkroom-base font-semibold"
                      : "border border-rim bg-darkroom-base text-ivory hover:border-amber-kodak/60"
                  }`}
                >
                  <BoardBookmarkIcon className="h-3.5 w-3.5" filled={isInBoard} />
                  {isInBoard ? "무드보드에 담김" : "무드보드 담기"}
                </button>

                <button
                  type="button"
                  onClick={() => onToggleCompare(item.id)}
                  disabled={!isInCompare && compareFull}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    isInCompare
                      ? "border border-amber-kodak bg-amber-kodak/20 text-amber-kodak"
                      : compareFull
                      ? "cursor-not-allowed border border-rim text-silver/45"
                      : "border border-rim bg-darkroom-base text-ivory hover:border-amber-kodak/60"
                  }`}
                >
                  <CompareIcon className="h-3.5 w-3.5" />
                  {isInCompare ? "비교 슬롯 해제" : "좌우 비교에 추가"}
                </button>

                <a
                  href={item.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-rim bg-darkroom-base px-3 py-1.5 text-xs font-medium text-silver transition-colors hover:border-rim-strong hover:text-ivory"
                >
                  <ExternalLinkIcon className="h-3.5 w-3.5" />
                  원본 아카이브
                </a>
              </div>
            </div>

            {/* 5-Color HEX Palette (Click to Copy) */}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-mono text-[11px] font-semibold uppercase tracking-wider text-silver">
                  COLOR FILM PALETTE (클릭하여 HEX 복사)
                </h3>
                {copiedHex && (
                  <span className="inline-flex items-center gap-1 font-mono text-[11px] text-amber-kodak">
                    <CheckIcon className="h-3 w-3" />
                    {copiedHex} 복사됨
                  </span>
                )}
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {item.palette.map((hex, i) => (
                  <button
                    key={`${item.id}-hex-${i}`}
                    type="button"
                    onClick={() => handleCopyHex(hex)}
                    className="group flex flex-col overflow-hidden rounded border border-rim bg-darkroom-base transition-colors hover:border-amber-kodak"
                    title={`${hex} 복사`}
                  >
                    <span
                      className="h-8 w-full"
                      style={{ backgroundColor: hex }}
                    />
                    <span className="flex items-center justify-center gap-1 py-1 font-mono text-[10px] text-silver group-hover:text-ivory">
                      {copiedHex === hex ? (
                        <CheckIcon className="h-2.5 w-2.5 text-amber-kodak" />
                      ) : (
                        <CopyIcon className="h-2.5 w-2.5 opacity-60" />
                      )}
                      {hex}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            {/* 3-Line Practical Breakdown for Marketers & Directors */}
            <section className="space-y-2.5">
              <h3 className="font-mono text-[11px] font-semibold uppercase tracking-wider text-silver">
                DIRECTOR & MARKETER 3-LINE BREAKDOWN
              </h3>

              <div className="rounded-lg border border-rim bg-darkroom-base p-3.5">
                <p className="font-mono text-[11px] font-semibold text-amber-kodak">
                  01 · 초반 3초 시선 고정 장치 (3s HOOK)
                </p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ivory">
                  {item.breakdown.hook3s}
                </p>
              </div>

              <div className="rounded-lg border border-rim bg-darkroom-base p-3.5">
                <p className="font-mono text-[11px] font-semibold text-amber-kodak">
                  02 · 구도 및 명암 설계 원리 (FRAMING)
                </p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ivory">
                  {item.breakdown.framing}
                </p>
              </div>

              <div className="rounded-lg border border-amber-kodak/30 bg-amber-kodak/8 p-3.5">
                <p className="font-mono text-[11px] font-semibold text-amber-kodak">
                  03 · 현대 캠페인·숏폼 실무 적용 (MARKETING APPLY)
                </p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ivory">
                  {item.breakdown.marketingApply}
                </p>
              </div>
            </section>

            {/* Dual Taxonomy Matrix */}
            <section className="space-y-2.5 border-t border-rim pt-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-wider text-silver">
                  시각 구도 택소노미
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {item.compositionTags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded border border-rim bg-darkroom-base px-2 py-0.5 text-xs text-ivory"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-wider text-silver">
                  마케팅 설득 훅 택소노미
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {item.persuasionTags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded border border-amber-kodak/35 bg-amber-kodak/12 px-2 py-0.5 text-xs text-amber-kodak"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
