"use client";

import React, { useEffect, useRef, useState } from "react";
import type { ArchiveItem } from "@/types/archive";
import { getAspectRatioClass } from "@/lib/taxonomy";
import { BoardBookmarkIcon, CompareIcon } from "@/components/Icons";

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
  compareFull,
  onOpenDetail,
  onToggleBoard,
  onToggleCompare,
}: SlideMountCardProps) {
  const cardRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [inView, setInView] = useState(false);
  const [hasEnteredViewport, setHasEnteredViewport] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [imgError, setImgError] = useState(false);

  const isAutoLoopVideo =
    item.mediaSource === "archive_mp4" && Boolean(item.previewVideoUrl);

  // Eyecandy-style viewport-aware muted auto-loop via IntersectionObserver
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

  // Play when visible in viewport, immediately pause on exit to protect CPU/memory
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

  const hasSavedState = isInBoard || isInCompare;

  return (
    <article
      ref={cardRef}
      className="group relative mb-3 break-inside-avoid overflow-hidden rounded-[4px] bg-[#111216] ring-1 ring-[#F4F1EA]/[0.08] transition-all duration-200 hover:ring-[#D99B26]/50"
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
        aria-label={`${item.titleKo} 상세 라이트박스 열기`}
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
          <div className="flex h-full w-full items-center justify-center bg-[#09090B] p-4 text-center font-mono text-[11px] text-silver">
            {item.id} · {item.originalTitle}
          </div>
        )}

        {/* Viewport Auto-Play Muted Loop for archive_mp4 */}
        {isAutoLoopVideo && hasEnteredViewport && item.previewVideoUrl && (
          <video
            ref={videoRef}
            src={item.previewVideoUrl}
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
            className="pointer-events-none absolute right-2 top-2 z-10 flex items-center gap-1 transition-opacity duration-150 group-hover:opacity-0 group-focus-within:opacity-0"
            aria-hidden="true"
          >
            {isInCompare && (
              <span className="h-2 w-2 rounded-full bg-[#D99B26] ring-2 ring-[#09090B]/80" />
            )}
            {isInBoard && (
              <span className="inline-flex h-4 items-center rounded-[2px] bg-[#D99B26] px-1 font-mono text-[9px] font-bold leading-none text-[#09090B] shadow-sm">
                B
              </span>
            )}
          </div>
        )}

        {/* Whisper Hover Top-Right Minimal Action Buttons */}
        <div className="absolute right-2 top-2 z-20 flex items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleCompare(item.id);
            }}
            disabled={!isInCompare && compareFull}
            aria-label={
              isInCompare
                ? "비교 슬롯에서 제거"
                : compareFull
                ? "최대 2개 작품까지 비교 가능"
                : "좌우 비교에 추가"
            }
            title={
              isInCompare
                ? "비교중 (해제)"
                : compareFull
                ? "최대 2개까지 비교 가능"
                : "비교 추가"
            }
            className={`inline-flex h-7 w-7 items-center justify-center rounded-[4px] border backdrop-blur-md transition-colors ${
              isInCompare
                ? "border-[#D99B26] bg-[#D99B26]/25 text-[#D99B26]"
                : compareFull
                ? "cursor-not-allowed border-[#F4F1EA]/10 bg-[#09090B]/65 text-silver/40"
                : "border-[#F4F1EA]/15 bg-[#09090B]/72 text-ivory hover:border-[#D99B26]/70 hover:text-[#D99B26]"
            }`}
          >
            <CompareIcon className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleBoard(item.id);
            }}
            aria-label={isInBoard ? "무드보드에서 제거" : "무드보드에 담기"}
            title={isInBoard ? "보드에 담김 (해제)" : "보드 담기"}
            className={`inline-flex h-7 w-7 items-center justify-center rounded-[4px] border backdrop-blur-md transition-colors ${
              isInBoard
                ? "border-[#D99B26] bg-[#D99B26] text-[#09090B]"
                : "border-[#F4F1EA]/15 bg-[#09090B]/72 text-ivory hover:border-[#D99B26]/70 hover:text-[#D99B26]"
            }`}
          >
            <BoardBookmarkIcon className="h-3.5 w-3.5" filled={isInBoard} />
          </button>
        </div>

        {/* Whisper Hover Bottom Multi-Stop Gradient + Minimal Caption */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-[#09090B]/92 via-[#09090B]/48 to-transparent px-2.5 pb-2.5 pt-12 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
          <p className="truncate text-[13px] font-medium leading-tight tracking-tight text-ivory">
            {item.titleKo}
          </p>
          <p className="mt-0.5 truncate font-mono text-[10px] tracking-wide text-silver/90">
            {item.brandOrSource} · {item.year} · {item.mediaType}
          </p>
        </div>
      </div>
    </article>
  );
}
