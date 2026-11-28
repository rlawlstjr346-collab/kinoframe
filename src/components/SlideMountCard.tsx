"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { ArchiveItem } from "@/types/archive";
import { globalVideoScheduler } from "@/lib/video-scheduler";
import { getCropLayerStyle, getVisibleAspect } from "@/lib/media-crop";
import { BoardBookmarkIcon } from "@/components/Icons";

export interface HighlightWindow {
  startSec: number;
  endSec: number | null;
}

export function computeHighlightWindow(
  durationSec: number | null
): HighlightWindow {
  if (!durationSec || !Number.isFinite(durationSec) || durationSec <= 4) {
    return { startSec: 0, endSec: null };
  }
  if (durationSec >= 600) {
    const startSec = Math.min(240, Math.floor(durationSec * 0.18));
    return {
      startSec,
      endSec: Math.min(durationSec - 1, startSec + 12),
    };
  }
  if (durationSec >= 80) {
    return {
      startSec: 32,
      endSec: Math.min(durationSec - 1, 43),
    };
  }
  if (durationSec >= 25) {
    return {
      startSec: 7,
      endSec: Math.min(durationSec - 1, 17),
    };
  }
  return {
    startSec: Math.min(2.5, Number((durationSec * 0.2).toFixed(1))),
    endSec: Math.min(durationSec - 0.5, 10),
  };
}

export function getHighlightWindow(
  itemOrDuration: Pick<ArchiveItem, "durationSec" | "startSec"> | number | null
): HighlightWindow {
  if (typeof itemOrDuration === "number" || itemOrDuration === null) {
    return computeHighlightWindow(itemOrDuration);
  }
  const dur = itemOrDuration.durationSec;
  const pinnedStart = itemOrDuration.startSec;
  if (
    typeof pinnedStart === "number" &&
    Number.isFinite(pinnedStart) &&
    pinnedStart > 0
  ) {
    const safeStart =
      dur && Number.isFinite(dur) && dur > 6
        ? Math.min(pinnedStart, Math.max(1, dur - 4))
        : pinnedStart;
    const endSec =
      dur && Number.isFinite(dur) && dur > safeStart + 2
        ? Math.min(dur - 1, safeStart + 12)
        : safeStart + 12;
    return {
      startSec: safeStart,
      endSec,
    };
  }
  return computeHighlightWindow(dur);
}

interface SlideMountCardProps {
  item: ArchiveItem;
  onOpenDetail: (item: ArchiveItem) => void;
  onEvictItem?: (id: string) => void;
  onImpression?: (id: string) => void;
  deckEpoch?: number;
  saved?: boolean;
  onToggleBoard?: (item: ArchiveItem) => void;
}

const STALL_EVICT_TIMEOUT_MS = 6500;
const IMPRESSION_DWELL_MS = 900;

export const SlideMountCard = React.memo(function SlideMountCard({
  item,
  onOpenDetail,
  onEvictItem,
  onImpression,
  deckEpoch = 0,
  saved = false,
  onToggleBoard,
}: SlideMountCardProps) {
  const cardRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const evictedRef = useRef<boolean>(false);
  const initialSeekDoneRef = useRef<boolean>(false);
  const impressionRecordedEpochRef = useRef<number>(-1);
  const windowRef = useRef<HighlightWindow>(getHighlightWindow(item));

  const [isNearViewport, setIsNearViewport] = useState(false);
  const [inView, setInView] = useState(false);
  const [slotAllowed, setSlotAllowed] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  useEffect(() => {
    windowRef.current = getHighlightWindow(item);
    initialSeekDoneRef.current = false;
    evictedRef.current = false;
    setVideoFailed(false);
  }, [item.id, item.durationSec, item.startSec]);

  const isAutoLoopVideo =
    item.mediaSource === "archive_mp4" && Boolean(item.previewVideoUrl);
  const isShortNativeLoop =
    isAutoLoopVideo &&
    item.durationSec !== null &&
    Number.isFinite(item.durationSec) &&
    item.durationSec <= 6;

  const triggerEvict = useCallback(() => {
    if (evictedRef.current) return;
    evictedRef.current = true;
    onEvictItem?.(item.id);
  }, [item.id, onEvictItem]);

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
          initialSeekDoneRef.current = false;
        }
      },
      {
        threshold: 0,
        rootMargin: "160px 0px",
      }
    );

    proximityObserver.observe(node);
    return () => proximityObserver.disconnect();
  }, [isAutoLoopVideo]);

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

  // Automatic viewport dwell impression tracking (>= 35% visible for >= 900ms)
  useEffect(() => {
    if (!onImpression) return;
    const node = cardRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;

    let dwellTimer: number | null = null;
    const clearTimer = () => {
      if (dwellTimer !== null) {
        window.clearTimeout(dwellTimer);
        dwellTimer = null;
      }
    };

    const impressionObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        const meetsThreshold =
          entry.isIntersecting && entry.intersectionRatio >= 0.35;
        if (meetsThreshold) {
          if (
            dwellTimer === null &&
            impressionRecordedEpochRef.current !== deckEpoch
          ) {
            dwellTimer = window.setTimeout(() => {
              dwellTimer = null;
              if (impressionRecordedEpochRef.current !== deckEpoch) {
                impressionRecordedEpochRef.current = deckEpoch;
                onImpression(item.id);
              }
            }, IMPRESSION_DWELL_MS);
          }
        } else {
          clearTimer();
        }
      },
      {
        threshold: [0, 0.35],
        rootMargin: "0px",
      }
    );

    impressionObserver.observe(node);
    return () => {
      clearTimer();
      impressionObserver.disconnect();
    };
  }, [item.id, onImpression, deckEpoch]);

  useEffect(() => {
    if (!isNearViewport) return;
    return () => {
      const video = videoRef.current;
      if (video) {
        try {
          video.pause();
          video.removeAttribute("src");
          video.load();
        } catch {
          // ignore cleanup restrictions
        }
      }
    };
  }, [isNearViewport]);

  const shouldPlayVideo =
    isAutoLoopVideo && isNearViewport && inView && slotAllowed;

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

  useEffect(() => {
    if (!shouldPlayVideo || videoReady || videoFailed || !onEvictItem) return;
    const timer = window.setTimeout(() => {
      if (!videoReady && !imgLoaded) {
        triggerEvict();
      }
    }, STALL_EVICT_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [
    shouldPlayVideo,
    videoReady,
    videoFailed,
    imgLoaded,
    onEvictItem,
    triggerEvict,
  ]);

  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    if (isShortNativeLoop) {
      initialSeekDoneRef.current = true;
      return;
    }
    const video = e.currentTarget;
    const realDur =
      Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : item.durationSec;
    const win = getHighlightWindow({
      durationSec: realDur,
      startSec: item.startSec,
    });
    windowRef.current = win;

    if (win.startSec > 0 && realDur && realDur > win.startSec + 2) {
      try {
        video.currentTime = win.startSec;
      } catch {
        initialSeekDoneRef.current = true;
      }
    } else {
      initialSeekDoneRef.current = true;
    }
  };

  const handleSeeked = () => {
    initialSeekDoneRef.current = true;
    setVideoReady(true);
  };

  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    const win = windowRef.current;
    if (win.endSec !== null && video.currentTime >= win.endSec) {
      try {
        video.currentTime = win.startSec;
      } catch {
        // ignore
      }
    }
  };

  // Wall loops load straight from the GitHub Releases CDN (no crossOrigin): zero Worker requests.
  // Only the viewer modal uses the same-origin /media stream, because it needs an untainted canvas.
  const videoSrc = item.previewVideoUrl;
  const setHovered = (hovered: boolean) => {
    if (isAutoLoopVideo) globalVideoScheduler.update(item.id, { hovered });
  };

  return (
    <article
      ref={cardRef}
      data-clip-id={item.id}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      className="group relative w-full rounded-[clamp(14px,0.95vw,30px)] bg-[var(--kf-tile-bg)] ring-1 ring-white/[0.07] transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-[2px] hover:shadow-[0_18px_40px_-18px_rgba(0,0,0,0.9),0_0_0_1px_rgba(255,255,255,0.18)]"
    >
      {/* Tile = visible picture only: baked-in letterbox/pillarbox bars are cropped away (item.crop). */}
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
        title={item.titleKo}
        aria-label={`${item.titleKo} 상세 보기`}
        style={{ aspectRatio: String(getVisibleAspect(item)) }}
        className="relative w-full cursor-pointer overflow-hidden rounded-[inherit] bg-[var(--kf-tile-bg)]"
      >
        <div
          style={getCropLayerStyle(item)}
          className="transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform group-hover:scale-[1.03]"
        >
          <img
            src={item.thumbnailUrl}
            alt={item.titleKo}
            loading="lazy"
            decoding="async"
            onLoad={() => setImgLoaded(true)}
            onError={() => {
              if (!isAutoLoopVideo) triggerEvict();
            }}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ease-linear ${
              videoReady && isNearViewport ? "opacity-0" : imgLoaded ? "opacity-100" : "opacity-0"
            }`}
          />

          {isAutoLoopVideo && isNearViewport && !videoFailed && videoSrc && (
            <video
              ref={videoRef}
              src={videoSrc}
              poster={item.thumbnailUrl}
              preload={isShortNativeLoop ? "auto" : slotAllowed || videoReady ? "metadata" : "none"}
              autoPlay={isShortNativeLoop && shouldPlayVideo}
              muted
              loop
              playsInline
              onLoadedMetadata={handleLoadedMetadata}
              onSeeked={handleSeeked}
              onPlaying={() => setVideoReady(true)}
              onLoadedData={() => {
                if (isShortNativeLoop || windowRef.current.startSec === 0 || initialSeekDoneRef.current) {
                  setVideoReady(true);
                }
              }}
              onCanPlay={() => {
                if (isShortNativeLoop || windowRef.current.startSec === 0 || initialSeekDoneRef.current) {
                  setVideoReady(true);
                }
              }}
              onTimeUpdate={isShortNativeLoop ? undefined : handleTimeUpdate}
              onError={(e) => {
                const code = e.currentTarget.error?.code;
                if (imgLoaded || (isShortNativeLoop && code === 4)) {
                  setVideoFailed(true);
                  setVideoReady(false);
                  return;
                }
                triggerEvict();
              }}
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ease-linear ${
                videoReady ? "opacity-100" : "opacity-0"
              }`}
            />
          )}
        </div>
      </div>

      {onToggleBoard && (
        <button
          type="button"
          onClick={() => onToggleBoard(item)}
          aria-pressed={saved}
          aria-label={saved ? `${item.titleKo} 내 보드에서 빼기` : `${item.titleKo} 내 보드에 담기`}
          className={`absolute right-[clamp(8px,0.5vw,18px)] top-[clamp(8px,0.5vw,18px)] inline-flex h-[clamp(32px,1.9vw,64px)] w-[clamp(32px,1.9vw,64px)] items-center justify-center rounded-full border border-white/[0.14] bg-black/55 backdrop-blur-xl transition-[opacity,transform,background-color] duration-[160ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-black/75 focus-visible:opacity-100 active:scale-[0.94] ${
            saved
              ? "text-[var(--kf-champagne)] opacity-100"
              : "text-white opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-0"
          }`}
        >
          <BoardBookmarkIcon filled={saved} className="h-[clamp(15px,0.9vw,30px)] w-[clamp(15px,0.9vw,30px)]" />
        </button>
      )}
    </article>
  );
});
