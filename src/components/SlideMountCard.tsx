"use client";

import React, { useState } from "react";
import type { ArchiveItem } from "@/types/archive";
import { formatDuration, getAspectRatioClass } from "@/lib/taxonomy";
import {
  BoardBookmarkIcon,
  CompareIcon,
  PlayIcon,
  ViewfinderIcon,
} from "@/components/Icons";

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
  const [isHovering, setIsHovering] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [imgError, setImgError] = useState(false);

  const canHoverVideo =
    item.mediaSource === "archive_mp4" && Boolean(item.previewVideoUrl);

  const handleEnter = () => {
    setIsHovering(true);
  };

  const handleLeave = () => {
    setIsHovering(false);
    setVideoReady(false);
  };

  return (
    <article
      className="slide-mount-border group relative flex flex-col overflow-hidden rounded-lg bg-darkroom-mount transition-colors duration-200 hover:bg-darkroom-hover"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {/* Top 35mm Slide Mount Header Strip */}
      <div className="flex items-center justify-between border-b border-rim px-3 py-2 font-mono text-[11px] tracking-wider text-silver">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-amber-kodak">{item.id}</span>
          <span className="h-2.5 w-px bg-ivory/15" aria-hidden="true" />
          <span className="text-ivory/90">{item.mediaType}</span>
          <span className="text-silver">{item.year}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded border border-rim bg-darkroom-base/80 px-1.5 py-0.5 text-[10px] text-silver">
            {item.aspectRatio}
          </span>
          <span className="text-[10px] text-silver">
            {formatDuration(item.durationSec)}
          </span>
        </div>
      </div>

      {/* Optical Film Frame Window */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onOpenDetail(item)}
        onFocus={handleEnter}
        onBlur={handleLeave}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpenDetail(item);
          }
        }}
        aria-label={`${item.titleKo} 상세 뷰파인더 열기`}
        className={`relative w-full cursor-pointer overflow-hidden bg-darkroom-base ${getAspectRatioClass(
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
            className={`h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03] ${
              videoReady && isHovering ? "opacity-0" : "opacity-100"
            }`}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-darkroom-recessed p-4 text-center font-mono text-xs text-silver">
            {item.id} · {item.originalTitle}
          </div>
        )}

        {/* Lightweight Hover MP4 Loop (Mounts ONLY while hovered/focused) */}
        {canHoverVideo && isHovering && item.previewVideoUrl && (
          <video
            src={item.previewVideoUrl}
            preload="none"
            muted
            loop
            playsInline
            autoPlay
            onCanPlay={() => setVideoReady(true)}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
              videoReady ? "opacity-100" : "opacity-0"
            }`}
          />
        )}

        {/* Optical Multi-Stop Frame Vignette */}
        <div className="frame-optical-vignette absolute inset-0" aria-hidden="true" />

        {/* Subtle Viewfinder Corner Brackets on Hover */}
        <div
          className="pointer-events-none absolute inset-2.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
          aria-hidden="true"
        >
          <span className="absolute left-0 top-0 h-3 w-3 border-l border-t border-amber-kodak/90" />
          <span className="absolute right-0 top-0 h-3 w-3 border-r border-t border-amber-kodak/90" />
          <span className="absolute bottom-0 left-0 h-3 w-3 border-b border-l border-amber-kodak/90" />
          <span className="absolute bottom-0 right-0 h-3 w-3 border-b border-r border-amber-kodak/90" />
        </div>

        {/* Media Indicator Badge */}
        <div className="pointer-events-none absolute bottom-2.5 left-2.5 flex items-center gap-1.5">
          {item.mediaSource === "archive_mp4" && (
            <span className="inline-flex items-center gap-1 rounded bg-darkroom-base/85 px-2 py-0.5 font-mono text-[10px] tracking-wide text-ivory backdrop-blur-sm">
              <PlayIcon className="h-2.5 w-2.5 text-amber-kodak" />
              {isHovering ? "PREVIEW LOOP" : "MP4 REEL"}
            </span>
          )}
          {item.mediaSource === "youtube_embed" && (
            <span className="inline-flex items-center gap-1 rounded bg-darkroom-base/85 px-2 py-0.5 font-mono text-[10px] tracking-wide text-ivory backdrop-blur-sm">
              <PlayIcon className="h-2.5 w-2.5 text-amber-kodak" />
              YT ARCHIVE
            </span>
          )}
        </div>

        {/* Hover Viewfinder Callout */}
        <div className="pointer-events-none absolute bottom-2.5 right-2.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <span className="inline-flex items-center gap-1 rounded border border-amber-kodak/50 bg-darkroom-base/90 px-2 py-0.5 font-mono text-[10px] text-amber-kodak">
            <ViewfinderIcon className="h-3 w-3" />
            VIEWFINDER
          </span>
        </div>
      </div>

      {/* Card Metadata Body */}
      <div className="flex flex-1 flex-col justify-between gap-3 p-3.5">
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <button
              type="button"
              onClick={() => onOpenDetail(item)}
              className="text-left text-[15px] font-semibold leading-snug tracking-tight text-ivory transition-colors hover:text-amber-kodak"
            >
              {item.titleKo}
            </button>
          </div>

          <p className="truncate font-mono text-[11px] text-silver">
            {item.brandOrSource} · {item.era}
          </p>

          {/* 1-Line 3s Hook Teaser */}
          <p className="line-clamp-2 text-[12.5px] leading-relaxed text-silver">
            {item.breakdown.hook3s}
          </p>

          {/* Dual Taxonomy Pills */}
          <div className="flex flex-wrap gap-1 pt-0.5">
            {item.compositionTags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="rounded border border-rim bg-darkroom-base/80 px-1.5 py-0.5 text-[11px] font-medium text-ivory/90"
              >
                {tag}
              </span>
            ))}
            {item.persuasionTags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="rounded border border-amber-kodak/30 bg-amber-kodak/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-kodak"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Footer: 5-Color Palette Strip + Quick Actions */}
        <div className="flex items-center justify-between border-t border-rim pt-2.5">
          <div className="flex items-center gap-1" aria-label="대표 5색 팔레트">
            {item.palette.map((hex, i) => (
              <span
                key={`${item.id}-p-${i}`}
                className="h-3 w-3 rounded-[2px] border border-ivory/15"
                style={{ backgroundColor: hex }}
                title={hex}
              />
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onToggleCompare(item.id)}
              disabled={!isInCompare && compareFull}
              title={
                isInCompare
                  ? "비교 슬롯에서 제거"
                  : compareFull
                  ? "최대 2개 작품까지 비교 가능"
                  : "좌우 비교 슬롯에 추가"
              }
              className={`inline-flex items-center gap-1 rounded px-2 py-1 font-mono text-[11px] transition-colors ${
                isInCompare
                  ? "border border-amber-kodak bg-amber-kodak/20 text-amber-kodak"
                  : compareFull
                  ? "cursor-not-allowed border border-rim text-silver/45"
                  : "border border-rim bg-darkroom-base/70 text-silver hover:border-rim-strong hover:text-ivory"
              }`}
            >
              <CompareIcon className="h-3.5 w-3.5" />
              <span>{isInCompare ? "비교중" : "비교"}</span>
            </button>

            <button
              type="button"
              onClick={() => onToggleBoard(item.id)}
              title={isInBoard ? "무드보드에서 제거" : "무드보드에 담기"}
              className={`inline-flex items-center gap-1 rounded px-2 py-1 font-mono text-[11px] transition-colors ${
                isInBoard
                  ? "border border-amber-kodak bg-amber-kodak text-darkroom-base font-semibold"
                  : "border border-rim bg-darkroom-base/70 text-silver hover:border-rim-strong hover:text-ivory"
              }`}
            >
              <BoardBookmarkIcon className="h-3.5 w-3.5" filled={isInBoard} />
              <span>{isInBoard ? "담김" : "보드"}</span>
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
