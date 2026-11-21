"use client";

import React, { useEffect, useRef, useState } from "react";
import type { ArchiveItem } from "@/types/archive";
import {
  getAspectRatioClass,
  getCategoryLabel,
  getCountryLabel,
  resolveItemCategory,
  resolveItemCountry,
} from "@/lib/taxonomy";
import {
  captureRawFramePngBlob,
  copyPngBlobToClipboard,
  downloadBlobAsPng,
} from "@/lib/frame-capture";

interface SlideMountCardProps {
  item: ArchiveItem;
  isInBoard: boolean;
  isInCompare: boolean;
  compareFull: boolean;
  onOpenDetail: (item: ArchiveItem) => void;
  onToggleBoard: (id: string) => void;
  onToggleCompare: (id: string) => void;
}

export function SlideMountCard({
  item,
  isInBoard,
  isInCompare,
  onOpenDetail,
  onToggleBoard,
}: SlideMountCardProps) {
  const cardRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [inView, setInView] = useState(false);
  const [hasEnteredViewport, setHasEnteredViewport] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copying" | "copied">(
    "idle"
  );

  const isAutoLoopVideo =
    item.mediaSource === "archive_mp4" && Boolean(item.previewVideoUrl);

  // Viewport-aware muted auto-loop via IntersectionObserver
  useEffect(() => {
    if (!isAutoLoopVideo) return;
    const node = cardRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        const visible = entry.isIntersecting && entry.intersectionRatio >= 0.25;
        setInView(visible);
        if (visible) {
          setHasEnteredViewport(true);
        }
      },
      {
        threshold: [0, 0.25, 0.5],
        rootMargin: "100px",
      }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [isAutoLoopVideo]);

  useEffect(() => {
    if (!isAutoLoopVideo) return;
    const video = videoRef.current;
    if (!video) return;

    if (inView) {
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {});
      }
    } else {
      video.pause();
    }
  }, [inView, isAutoLoopVideo, videoReady]);

  const handleQuickCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (copyStatus === "copying") return;
    setCopyStatus("copying");
    try {
      const blob = await captureRawFramePngBlob(item, videoRef.current);
      const copied = await copyPngBlobToClipboard(blob);
      if (!copied) {
        downloadBlobAsPng(blob, `${item.id}_frame.png`);
      }
      setCopyStatus("copied");
      window.setTimeout(() => setCopyStatus("idle"), 1600);
    } catch {
      setCopyStatus("idle");
    }
  };

  const categoryLabel = getCategoryLabel(resolveItemCategory(item));
  const countryLabel = getCountryLabel(resolveItemCountry(item));
  const hasSavedState = isInBoard || isInCompare;

  return (
    <article
      ref={cardRef}
      className="group relative mb-3 break-inside-avoid overflow-hidden rounded-[4px] bg-[#111216] ring-1 ring-[#F4F1EA]/[0.08] transition-all duration-200 hover:ring-[#F4F1EA]/40"
    >
      {/* Pure Zero-Chrome Visual Frame Window */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onOpenDetail(item)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpenDetail(item);
          }
        }}
        aria-label={`${item.titleKo} 상세 보기`}
        className={`relative w-full cursor-pointer overflow-hidden bg-[#111216] ${getAspectRatioClass(
          item.aspectRatio
        )}`}
      >
        {!imgError ? (
          <img
            src={item.thumbnailUrl}
            alt={`${item.titleKo} (${item.year})`}
            loading="lazy"
            decoding="async"
            onError={() => setImgError(true)}
            className={`h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.025] ${
              videoReady && inView ? "opacity-0" : "opacity-100"
            }`}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[#09090B] p-4 text-center font-mono text-xs text-silver">
            {item.id} · {item.originalTitle}
          </div>
        )}

        {/* Viewport Auto-Play Muted Loop for archive_mp4 */}
        {isAutoLoopVideo && hasEnteredViewport && item.previewVideoUrl && (
          <video
            ref={videoRef}
            src={item.previewVideoUrl}
            poster={item.thumbnailUrl}
            preload="metadata"
            muted
            loop
            playsInline
            onCanPlay={() => setVideoReady(true)}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
              videoReady && inView ? "opacity-100" : "opacity-0"
            }`}
          />
        )}

        {/* Subtle Persistent Saved Indicator (Visible Before Hover) */}
        {hasSavedState && (
          <div
            className="pointer-events-none absolute right-2.5 top-2.5 z-10 flex items-center gap-1 transition-opacity duration-150 group-hover:opacity-0 group-focus-within:opacity-0"
            aria-hidden="true"
          >
            {isInCompare && (
              <span className="h-2.5 w-2.5 rounded-full bg-[#D99B26] ring-2 ring-[#09090B]/80" />
            )}
            {isInBoard && (
              <span className="inline-flex h-5 items-center rounded-full bg-[#D99B26] px-2 text-[11px] font-bold leading-none text-[#09090B] shadow-md">
                저장됨
              </span>
            )}
          </div>
        )}

        {/* Pinterest-Style Top-Right High-Visibility Action Buttons on Hover */}
        <div className="absolute right-2.5 top-2.5 z-20 flex items-center gap-1.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
          <button
            type="button"
            onClick={handleQuickCopy}
            aria-label="이미지 클립보드 복사"
            className="inline-flex h-10 items-center justify-center rounded-full border border-white/20 bg-[#09090B]/85 px-3.5 text-[14px] font-semibold text-white backdrop-blur-md transition-colors hover:border-white/50 hover:bg-[#09090B] 2xl:text-[15px]"
          >
            {copyStatus === "copied"
              ? "복사됨"
              : copyStatus === "copying"
              ? "..."
              : "복사"}
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleBoard(item.id);
            }}
            aria-label={isInBoard ? "보드에서 제거" : "보드에 저장"}
            className={`inline-flex h-10 items-center justify-center rounded-full px-4 text-[14px] font-bold shadow-lg transition-colors 2xl:text-[15px] ${
              isInBoard
                ? "bg-[#D99B26] text-[#09090B] hover:bg-[#e5aa38]"
                : "bg-[#FAF8F5] text-[#09090B] hover:bg-white"
            }`}
          >
            {isInBoard ? "저장됨" : "저장"}
          </button>
        </div>

        {/* High-Contrast QHD/4K Bottom Hover Caption */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-[#09090B]/96 via-[#09090B]/60 to-transparent px-3.5 pb-3.5 pt-16 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
          <p className="truncate text-[16px] font-bold leading-snug tracking-tight text-white 2xl:text-[18px]">
            {item.titleKo}
          </p>
          <p className="mt-0.5 truncate text-[13px] font-medium tracking-wide text-[#E6E2D8] 2xl:text-[15px]">
            {countryLabel} · {item.year} · {categoryLabel}
          </p>
        </div>
      </div>
    </article>
  );
}
