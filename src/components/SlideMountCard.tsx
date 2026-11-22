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
import { globalVideoScheduler } from "@/lib/video-scheduler";

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

  const [isNearViewport, setIsNearViewport] = useState(false);
  const [inView, setInView] = useState(false);
  const [slotAllowed, setSlotAllowed] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copying" | "copied">(
    "idle"
  );

  const isAutoLoopVideo =
    item.mediaSource === "archive_mp4" &&
    Boolean(item.previewVideoUrl) &&
    !videoError;

  // Offscreen memory reclamation: mount <video> only within 360px of viewport, unmount when scrolled away
  useEffect(() => {
    if (!isAutoLoopVideo) {
      setIsNearViewport(false);
      return;
    }
    const node = cardRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;

    const proximityObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        const near = entry.isIntersecting;
        setIsNearViewport(near);
        if (!near) {
          setVideoReady(false);
        }
      },
      {
        threshold: 0,
        rootMargin: "360px 0px",
      }
    );

    proximityObserver.observe(node);
    return () => proximityObserver.disconnect();
  }, [isAutoLoopVideo]);

  // Global concurrent playback slot scheduler (max 18 desktop / 6 mobile, hysteresis + hover priority)
  useEffect(() => {
    if (!isAutoLoopVideo) return;
    const node = cardRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;

    globalVideoScheduler.register({
      id: item.id,
      ratio: 0,
      centerDistance: Number.POSITIVE_INFINITY,
      hovered: false,
      onSlotChange: (allowed) => setSlotAllowed(allowed),
    });

    const visibilityObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        const visible = entry.isIntersecting && entry.intersectionRatio >= 0.15;
        setInView(visible);
        const viewportCenter =
          typeof window !== "undefined" ? window.innerHeight / 2 : 540;
        const rectCenter =
          entry.boundingClientRect.top + entry.boundingClientRect.height / 2;
        globalVideoScheduler.update(item.id, {
          ratio: entry.isIntersecting ? entry.intersectionRatio : 0,
          centerDistance: Math.abs(rectCenter - viewportCenter),
        });
      },
      {
        threshold: [0, 0.15, 0.4, 0.75],
        rootMargin: "0px",
      }
    );

    visibilityObserver.observe(node);
    return () => {
      visibilityObserver.disconnect();
      globalVideoScheduler.unregister(item.id);
      setSlotAllowed(false);
    };
  }, [isAutoLoopVideo, item.id]);

  const shouldPlayVideo = isAutoLoopVideo && isNearViewport && inView && slotAllowed;

  useEffect(() => {
    if (!isAutoLoopVideo) return;
    const video = videoRef.current;
    if (!video) return;

    if (shouldPlayVideo) {
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {});
      }
    } else {
      video.pause();
    }
  }, [shouldPlayVideo, isAutoLoopVideo, videoReady]);

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

  return (
    <article
      ref={cardRef}
      onMouseEnter={() => {
        if (isAutoLoopVideo) {
          globalVideoScheduler.update(item.id, { hovered: true });
        }
      }}
      onMouseLeave={() => {
        if (isAutoLoopVideo) {
          globalVideoScheduler.update(item.id, { hovered: false });
        }
      }}
      onFocus={() => {
        if (isAutoLoopVideo) {
          globalVideoScheduler.update(item.id, { hovered: true });
        }
      }}
      onBlur={() => {
        if (isAutoLoopVideo) {
          globalVideoScheduler.update(item.id, { hovered: false });
        }
      }}
      className="group relative w-full overflow-hidden rounded-[2px] bg-[#111216] ring-0 transition-all duration-200 hover:ring-1 hover:ring-[#FAF8F5]/45"
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
              videoReady && !videoError && isNearViewport ? "opacity-0" : "opacity-100"
            }`}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[#09090B] p-4 text-center font-mono text-xs text-silver">
            {item.id} · {item.originalTitle}
          </div>
        )}

        {/* Viewport Proximity Auto-Play Muted Loop with Zero Poster-Flicker Retention */}
        {isAutoLoopVideo && isNearViewport && item.previewVideoUrl && (
          <video
            ref={videoRef}
            src={item.previewVideoUrl}
            poster={item.thumbnailUrl}
            preload={slotAllowed || videoReady ? "metadata" : "none"}
            muted
            loop
            playsInline
            onLoadedData={() => setVideoReady(true)}
            onCanPlay={() => setVideoReady(true)}
            onError={() => {
              setVideoError(true);
              setVideoReady(false);
            }}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
              videoReady && !videoError ? "opacity-100" : "opacity-0"
            }`}
          />
        )}

        {/* Hover/Focus-Only Action HUD (100% Zero-Chrome Resting Wall) */}
        <div className="absolute right-2 top-2 z-20 flex items-center gap-1.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
          {isInCompare && (
            <span
              className="h-2.5 w-2.5 rounded-full bg-[#D99B26] ring-2 ring-[#09090B]/80"
              aria-hidden="true"
            />
          )}
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
