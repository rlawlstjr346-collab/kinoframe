"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { ArchiveItem } from "@/types/archive";
import { getAspectRatioClass } from "@/lib/taxonomy";
import { globalVideoScheduler } from "@/lib/video-scheduler";

export interface HighlightWindow {
  startSec: number;
  endSec: number | null;
}

export function computeHighlightWindow(durationSec: number | null): HighlightWindow {
  if (!durationSec || !Number.isFinite(durationSec) || durationSec < 12) {
    return { startSec: 0, endSec: null };
  }
  if (durationSec >= 60) {
    return {
      startSec: 24,
      endSec: Math.min(durationSec - 1, 36),
    };
  }
  if (durationSec >= 25) {
    return {
      startSec: 7,
      endSec: Math.min(durationSec - 1, 17),
    };
  }
  return {
    startSec: 2.5,
    endSec: Math.min(durationSec - 0.5, 10.5),
  };
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

export function SlideMountCard({
  item,
  onOpenDetail,
  onEvictItem,
}: SlideMountCardProps) {
  const cardRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const evictedRef = useRef<boolean>(false);
  const initialSeekDoneRef = useRef<boolean>(false);
  const windowRef = useRef<HighlightWindow>(computeHighlightWindow(item.durationSec));

  const [isNearViewport, setIsNearViewport] = useState(false);
  const [inView, setInView] = useState(false);
  const [slotAllowed, setSlotAllowed] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  const highlightWindow = useMemo(
    () => computeHighlightWindow(item.durationSec),
    [item.durationSec]
  );
  windowRef.current = highlightWindow;

  const isAutoLoopVideo =
    item.mediaSource === "archive_mp4" && Boolean(item.previewVideoUrl);

  const triggerEvict = () => {
    if (evictedRef.current) return;
    evictedRef.current = true;
    onEvictItem?.(item.id);
  };

  // Offscreen memory reclamation: mount <video> only within 360px of viewport
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
        rootMargin: "360px 0px",
      }
    );

    proximityObserver.observe(node);
    return () => proximityObserver.disconnect();
  }, [isAutoLoopVideo]);

  // Global concurrent playback slot scheduler (desktop 18 / mobile 6 + hysteresis + modal suspension)
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

  // Auto-evict stalled/unplayable video tiles if not decoded within 6.5s of slot grant
  useEffect(() => {
    if (!shouldPlayVideo || videoReady || !onEvictItem) return;
    const timer = window.setTimeout(() => {
      if (!videoReady) {
        triggerEvict();
      }
    }, STALL_EVICT_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldPlayVideo, videoReady, onEvictItem, item.id]);

  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    const realDur = Number.isFinite(video.duration) && video.duration > 0
      ? video.duration
      : item.durationSec;
    const win = computeHighlightWindow(realDur);
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
      className="relative w-full cursor-pointer overflow-hidden rounded-[16px] bg-[#080808]"
    >
      {/* Pure Eyecandy Zero-Chrome Tile: zero hover text, zero badges, zero borders */}
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
        className={`relative w-full overflow-hidden rounded-[16px] bg-[#080808] ${getAspectRatioClass(
          item.aspectRatio
        )}`}
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
            preload={slotAllowed || videoReady ? "metadata" : "none"}
            muted
            loop
            playsInline
            onLoadedMetadata={handleLoadedMetadata}
            onSeeked={handleSeeked}
            onLoadedData={() => {
              if (windowRef.current.startSec === 0 || initialSeekDoneRef.current) {
                setVideoReady(true);
              }
            }}
            onCanPlay={() => {
              if (windowRef.current.startSec === 0 || initialSeekDoneRef.current) {
                setVideoReady(true);
              }
            }}
            onTimeUpdate={handleTimeUpdate}
            onError={triggerEvict}
            className={`absolute inset-0 h-full w-full rounded-[16px] object-cover transition-opacity duration-200 ease-linear ${
              videoReady ? "opacity-100" : "opacity-0"
            }`}
          />
        )}
      </div>
    </article>
  );
}
