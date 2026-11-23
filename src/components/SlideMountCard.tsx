"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { ArchiveItem } from "@/types/archive";
import { getAspectRatioClass } from "@/lib/taxonomy";
import { globalVideoScheduler } from "@/lib/video-scheduler";

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
  isInBoard?: boolean;
  isInCompare?: boolean;
  compareFull?: boolean;
  onOpenDetail: (item: ArchiveItem) => void;
  onToggleBoard?: (id: string) => void;
  onToggleCompare?: (id: string) => void;
  onEvictItem?: (id: string) => void;
}

const STALL_EVICT_TIMEOUT_MS = 6500;

export const SlideMountCard = React.memo(function SlideMountCard({
  item,
  onOpenDetail,
  onEvictItem,
}: SlideMountCardProps) {
  const cardRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const evictedRef = useRef<boolean>(false);
  const initialSeekDoneRef = useRef<boolean>(false);
  const windowRef = useRef<HighlightWindow>(getHighlightWindow(item));

  const [isNearViewport, setIsNearViewport] = useState(false);
  const [inView, setInView] = useState(false);
  const [slotAllowed, setSlotAllowed] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  // Recompute highlight window ONLY when item identity changes (never overwrite on re-render)
  useEffect(() => {
    windowRef.current = getHighlightWindow(item);
    initialSeekDoneRef.current = false;
    evictedRef.current = false;
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

  // Offscreen hardware decoder & socket reclamation: mount <video> only within 160px of viewport
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

  // Global concurrent playback slot scheduler (desktop 8 / mobile 4 + hysteresis + modal suspension)
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

  // Explicit hardware decoder flush when <video> unmounts or leaves proximity
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

  // Auto-evict stalled/unplayable video tiles if not decoded within 6.5s of slot grant
  useEffect(() => {
    if (!shouldPlayVideo || videoReady || !onEvictItem) return;
    const timer = window.setTimeout(() => {
      if (!videoReady) {
        triggerEvict();
      }
    }, STALL_EVICT_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [shouldPlayVideo, videoReady, onEvictItem, triggerEvict]);

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
        // ignore seek restrictions
      }
    }
  };

  // Normalize excessive portrait 4:5 tiles to crisp 4:3 frames on the 5-column wall
  const gridAspectClass =
    item.aspectRatio === "4:5"
      ? "aspect-[4/3]"
      : getAspectRatioClass(item.aspectRatio);

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
      className="relative w-full cursor-pointer overflow-hidden rounded-[16px] bg-[#0B0C0F] ring-1 ring-white/[0.08]"
    >
      {/* Zero-Chrome Tile: crisp full-bleed 16px radius frame with subtle darkroom edge */}
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
        className={`relative w-full overflow-hidden rounded-[16px] bg-[#0B0C0F] ${gridAspectClass}`}
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
          className={`h-full w-full rounded-[16px] object-cover transition-opacity duration-200 ease-linear ${
            videoReady && isNearViewport
              ? "opacity-0"
              : imgLoaded
              ? "opacity-100"
              : "opacity-0"
          }`}
        />

        {isAutoLoopVideo && isNearViewport && item.previewVideoUrl && (
          <video
            ref={videoRef}
            src={item.previewVideoUrl}
            poster={item.thumbnailUrl}
            preload={
              isShortNativeLoop
                ? "auto"
                : slotAllowed || videoReady
                ? "metadata"
                : "none"
            }
            autoPlay={isShortNativeLoop && shouldPlayVideo}
            muted
            loop
            playsInline
            onLoadedMetadata={handleLoadedMetadata}
            onSeeked={handleSeeked}
            onPlaying={() => setVideoReady(true)}
            onLoadedData={() => {
              if (
                isShortNativeLoop ||
                windowRef.current.startSec === 0 ||
                initialSeekDoneRef.current
              ) {
                setVideoReady(true);
              }
            }}
            onCanPlay={() => {
              if (
                isShortNativeLoop ||
                windowRef.current.startSec === 0 ||
                initialSeekDoneRef.current
              ) {
                setVideoReady(true);
              }
            }}
            onTimeUpdate={isShortNativeLoop ? undefined : handleTimeUpdate}
            onError={triggerEvict}
            className={`absolute inset-0 h-full w-full rounded-[16px] object-cover transition-opacity duration-200 ease-linear ${
              videoReady ? "opacity-100" : "opacity-0"
            }`}
          />
        )}
      </div>
    </article>
  );
});
