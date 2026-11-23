"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { ArchiveItem } from "@/types/archive";
import { formatPreciseTimestamp } from "@/lib/taxonomy";
import {
  captureRawFramePngBlob,
  copyPngBlobToClipboard,
  downloadBlobAsPng,
  downloadVideoMp4,
} from "@/lib/frame-capture";
import { getHighlightWindow } from "@/components/SlideMountCard";
import { globalVideoScheduler } from "@/lib/video-scheduler";

interface ViewfinderModalProps {
  item: ArchiveItem;
  hasPrev: boolean;
  hasNext: boolean;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}

/**
 * Clean title & sub-caption parser:
 * Avoids redundant parentheses like "기생충 (Parasite) (2019)" ->
 *   primaryTitle: "기생충"
 *   subCaption:   "Parasite · 2019 · Bong Joon-ho"
 */
export function formatCleanModalMeta(item: ArchiveItem): {
  primaryTitle: string;
  subCaption: string;
} {
  let primary = (item.titleKo || item.originalTitle || "").trim();
  // Remove trailing year parenthesis like "(1971)" or "(2019)" from primary title
  primary = primary.replace(/\s*\((?:19|20)\d{2}\)\s*$/, "").trim();
  // If titleKo is "한글제목 (English Title)", extract clean Korean main title
  const parenMatch = primary.match(/^(.+?)\s*\(([^()]+)\)\s*$/);
  if (parenMatch) {
    const left = parenMatch[1].trim();
    const inside = parenMatch[2].trim();
    // Only strip parenthetical if it's an English title / duplicate of originalTitle
    if (/[가-힣]/.test(left) && /[A-Za-z]/.test(inside)) {
      primary = left;
    }
  }
  // Remove trailing director/credit after middle dot if duplicated in brandOrSource
  primary = primary.replace(/\s*·\s*$/, "").trim();

  // Extract clean original work title (strip "(Director, Year)" suffix)
  let origWork = (item.originalTitle || "").trim();
  let extractedCredit = "";
  const origCreditMatch = origWork.match(/^(.+?)\s*\(([^()]+)\)\s*$/);
  if (origCreditMatch) {
    origWork = origCreditMatch[1].trim();
    const creditParts = origCreditMatch[2]
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s && !/^(?:19|20)\d{2}$/.test(s));
    if (creditParts.length > 0) {
      extractedCredit = creditParts.join(", ");
    }
  }

  const credit = (extractedCredit || item.brandOrSource || "")
    .replace(/\s*\((?:19|20)\d{2}\)\s*$/, "")
    .trim();

  const parts: string[] = [];
  if (origWork && origWork.toLowerCase() !== primary.toLowerCase()) {
    parts.push(origWork);
  }
  if (item.year) {
    parts.push(String(item.year));
  }
  if (
    credit &&
    !parts.some((p) => p.toLowerCase().includes(credit.toLowerCase()))
  ) {
    parts.push(credit);
  }

  return {
    primaryTitle: primary || item.originalTitle,
    subCaption: parts.join(" · "),
  };
}

/**
 * Guarantees zero dead links on '원본 보기 ↗':
 * Uses item.sourceUrl when it is a valid http(s) URL, otherwise falls back safely
 * to an official YouTube search for the work + year.
 */
export function resolveValidSourceUrl(item: ArchiveItem): string {
  const raw = (item.sourceUrl || "").trim();
  if (raw) {
    try {
      const u = new URL(raw);
      if (u.protocol === "https:" || u.protocol === "http:") {
        return u.toString();
      }
    } catch {
      // fall through
    }
  }
  const q = `${item.originalTitle || item.titleKo} ${item.year || ""}`.trim();
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
}

export function ViewfinderModal({
  item,
  hasPrev,
  hasNext,
  onClose,
  onPrev,
  onNext,
}: ViewfinderModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const initialJumpedRef = useRef<boolean>(false);
  const toastTimerRef = useRef<number | null>(null);

  const [currentTimeSec, setCurrentTimeSec] = useState<number>(0);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [userPaused, setUserPaused] = useState<boolean>(false);
  const [detectedSd, setDetectedSd] = useState<boolean>(false);
  const [videoFailed, setVideoFailed] = useState<boolean>(false);
  const [busyAction, setBusyAction] = useState<"download" | "capture" | null>(
    null
  );
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const { primaryTitle, subCaption } = useMemo(
    () => formatCleanModalMeta(item),
    [item]
  );
  const externalSourceUrl = useMemo(() => resolveValidSourceUrl(item), [item]);

  const isArchivalSd = useMemo(() => {
    if (item.isArchivalSd === true) return true;
    if (detectedSd) return true;
    if (
      typeof item.width === "number" &&
      typeof item.height === "number" &&
      item.width > 0 &&
      item.height > 0 &&
      item.width <= 1024 &&
      item.width / item.height < 1.58
    ) {
      return true;
    }
    return false;
  }, [item.isArchivalSd, item.width, item.height, detectedSd]);

  // Suspend background grid videos while theater modal is open
  useEffect(() => {
    globalVideoScheduler.setSuspended(true);
    return () => {
      globalVideoScheduler.setSuspended(false);
    };
  }, []);

  useEffect(() => {
    initialJumpedRef.current = false;
    setCurrentTimeSec(0);
    setIsPaused(false);
    setUserPaused(false);
    setDetectedSd(false);
    setVideoFailed(false);
    setToastMsg(null);
  }, [item]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const togglePlayPause = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      setUserPaused(false);
      setIsPaused(false);
      void v.play().catch(() => {});
    } else {
      v.pause();
      setUserPaused(true);
      setIsPaused(true);
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT");

      if (e.key === "Escape") onClose();
      if (isTyping) return;
      if (e.key === " " && item.mediaSource === "archive_mp4") {
        e.preventDefault();
        togglePlayPause();
      }
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
  }, [onClose, onPrev, onNext, hasPrev, hasNext, item.mediaSource]);

  const flashToast = (msg: string) => {
    setToastMsg(msg);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => setToastMsg(null), 2600);
  };

  // Button 2: Download original loop video (.mp4)
  const handleDownloadMp4 = async () => {
    setBusyAction("download");
    try {
      if (item.mediaSource === "archive_mp4" && item.previewVideoUrl) {
        await downloadVideoMp4(item);
        flashToast(`kinoframe-${item.id}.mp4 다운로드 완료`);
      } else {
        const blob = await captureRawFramePngBlob(item, videoRef.current);
        downloadBlobAsPng(blob, `kinoframe-${item.id}.png`);
        flashToast(`kinoframe-${item.id}.png 다운로드 완료`);
      }
    } catch {
      flashToast("영상 다운로드에 실패했습니다");
    } finally {
      setBusyAction(null);
    }
  };

  // Button 3: Capture current live <video> frame -> PNG download + clipboard copy + top Apple toast
  const handleCaptureCurrentFrame = async () => {
    setBusyAction("capture");
    try {
      const liveTime = videoRef.current?.currentTime ?? currentTimeSec;
      const tsSuffix =
        item.mediaSource === "archive_mp4"
          ? `_${formatPreciseTimestamp(liveTime).replace(/[:.]/g, "-")}`
          : "";
      const blob = await captureRawFramePngBlob(item, videoRef.current);
      const filename = `kinoframe-${item.id}_frame${tsSuffix}.png`;
      downloadBlobAsPng(blob, filename);
      const copied = await copyPngBlobToClipboard(blob);
      if (copied) {
        flashToast("프레임 PNG 저장 및 클립보드 복사 완료");
      } else {
        flashToast(`프레임 PNG 저장 완료 (${filename})`);
      }
    } catch {
      flashToast("프레임 캡처에 실패했습니다");
    } finally {
      setBusyAction(null);
    }
  };

  const handleModalVideoMetadata = (
    e: React.SyntheticEvent<HTMLVideoElement>
  ) => {
    const video = e.currentTarget;
    if (
      video.videoWidth > 0 &&
      video.videoHeight > 0 &&
      video.videoWidth <= 1024 &&
      video.videoWidth / video.videoHeight < 1.58
    ) {
      setDetectedSd(true);
    }
    if (initialJumpedRef.current) return;
    initialJumpedRef.current = true;
    const realDur =
      Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : item.durationSec;
    if (realDur && realDur <= 6) return;
    const win = getHighlightWindow({
      durationSec: realDur,
      startSec: item.startSec,
    });
    if (win.startSec > 0 && realDur && realDur > win.startSec + 2) {
      try {
        video.currentTime = win.startSec;
      } catch {
        // ignore
      }
    }
  };

  const mediaScaleClass = isArchivalSd
    ? "max-h-[min(60vh,720px)] max-w-[min(74vw,960px)] w-auto h-auto block"
    : "max-h-[76vh] max-w-[86vw] w-auto h-auto block";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/82 p-3 backdrop-blur-2xl sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`${primaryTitle} 상세 뷰`}
      onClick={onClose}
    >
      {/* Top Floating Rounded Apple Glass Toast */}
      {toastMsg && (
        <div
          role="status"
          aria-live="polite"
          className="fixed left-1/2 top-6 z-[130] -translate-x-1/2 rounded-full border border-white/[0.14] bg-[#1C1C1E]/92 px-5 py-2.5 text-[14px] font-medium tracking-[-0.01em] text-white shadow-[0_14px_40px_rgba(0,0,0,0.65)] backdrop-blur-2xl"
        >
          {toastMsg}
        </div>
      )}

      {/* Top-Right Close Button (Apple Glass Circle) */}
      <button
        type="button"
        onClick={onClose}
        aria-label="닫기"
        className="fixed right-[clamp(16px,1.5vw,32px)] top-[clamp(16px,1.5vw,32px)] z-[120] inline-flex h-[clamp(42px,2.7vw,54px)] w-[clamp(42px,2.7vw,54px)] items-center justify-center rounded-full border border-white/[0.12] bg-[#1C1C1E]/80 text-white backdrop-blur-2xl transition-colors hover:bg-white/[0.20]"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-[clamp(19px,1.2vw,24px)] w-[clamp(19px,1.2vw,24px)]"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
        >
          <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>

      {/* Left / Right Navigation Chevrons */}
      {hasPrev && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPrev();
          }}
          aria-label="이전 클립"
          className="fixed left-[clamp(12px,1.4vw,30px)] top-1/2 z-[120] inline-flex h-[clamp(46px,3vw,62px)] w-[clamp(46px,3vw,62px)] -translate-y-1/2 items-center justify-center rounded-full border border-white/[0.12] bg-[#1C1C1E]/80 text-white backdrop-blur-2xl transition-colors hover:bg-white/[0.20]"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-[clamp(20px,1.3vw,28px)] w-[clamp(20px,1.3vw,28px)]"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 5l-7 7 7 7"
            />
          </svg>
        </button>
      )}

      {hasNext && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNext();
          }}
          aria-label="다음 클립"
          className="fixed right-[clamp(12px,1.4vw,30px)] top-1/2 z-[120] inline-flex h-[clamp(46px,3vw,62px)] w-[clamp(46px,3vw,62px)] -translate-y-1/2 items-center justify-center rounded-full border border-white/[0.12] bg-[#1C1C1E]/80 text-white backdrop-blur-2xl transition-colors hover:bg-white/[0.20]"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-[clamp(20px,1.3vw,28px)] w-[clamp(20px,1.3vw,28px)]"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      )}

      {/* Concentric Apple Dark-Glass Theater Container (Tightly hugs native video aspect ratio, zero pillarbox bars) */}
      <div
        className="relative z-[105] w-fit max-w-[90vw] rounded-[30px] border border-white/[0.12] bg-[#1C1C1E]/88 p-3 shadow-[0_40px_120px_rgba(0,0,0,0.88)] backdrop-blur-2xl sm:p-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Concentric Inner Stage (rounded-[20px], zero black filler box) */}
        <div
          onClick={
            item.mediaSource === "archive_mp4" &&
            item.previewVideoUrl &&
            !videoFailed
              ? togglePlayPause
              : undefined
          }
          className={`relative overflow-hidden rounded-[20px] bg-[#0B0B0D] ${
            item.mediaSource === "archive_mp4" &&
            item.previewVideoUrl &&
            !videoFailed
              ? "cursor-pointer"
              : ""
          }`}
        >
          {item.mediaSource === "archive_mp4" &&
          item.previewVideoUrl &&
          !videoFailed ? (
            <>
              <video
                key={item.id}
                ref={videoRef}
                src={item.previewVideoUrl}
                poster={item.thumbnailUrl}
                preload="auto"
                autoPlay
                muted
                loop
                playsInline
                onLoadedMetadata={handleModalVideoMetadata}
                onTimeUpdate={(e) =>
                  setCurrentTimeSec(e.currentTarget.currentTime)
                }
                onSeeked={(e) =>
                  setCurrentTimeSec(e.currentTarget.currentTime)
                }
                onPlay={() => {
                  setIsPaused(false);
                  setUserPaused(false);
                }}
                onPause={() => setIsPaused(true)}
                onError={() => setVideoFailed(true)}
                className={mediaScaleClass}
              />
              {/* Show translucent Apple glass pause icon ONLY when explicitly paused by user */}
              {userPaused && isPaused && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/22"
                >
                  <span className="inline-flex h-[clamp(56px,4vw,80px)] w-[clamp(56px,4vw,80px)] items-center justify-center rounded-full border border-white/[0.18] bg-[#1C1C1E]/75 text-white backdrop-blur-xl">
                    <svg
                      viewBox="0 0 24 24"
                      className="h-[clamp(24px,1.7vw,34px)] w-[clamp(24px,1.7vw,34px)]"
                      fill="currentColor"
                    >
                      <rect x="6.5" y="5" width="3.8" height="14" rx="1.2" />
                      <rect x="13.7" y="5" width="3.8" height="14" rx="1.2" />
                    </svg>
                  </span>
                </div>
              )}
            </>
          ) : (
            <img
              key={item.id}
              src={item.thumbnailUrl}
              alt={primaryTitle}
              className={mediaScaleClass}
            />
          )}
        </div>

        {/* Bottom Metadata + Strictly 3 Apple Pill Buttons */}
        <div className="mt-3.5 flex flex-col gap-3 px-1 sm:mt-4 sm:flex-row sm:items-center sm:justify-between sm:gap-5 sm:px-2">
          {/* Left: Clean Primary Title + One-Line Sub-Caption */}
          <div className="min-w-0">
            <h1 className="truncate text-[clamp(17px,1.1vw,23px)] font-semibold leading-snug tracking-[-0.02em] text-white">
              {primaryTitle}
            </h1>
            {subCaption && (
              <p className="mt-0.5 truncate text-[clamp(13px,0.82vw,16px)] tracking-[-0.01em] text-[#98989D]">
                {subCaption}
              </p>
            )}
          </div>

          {/* Right: 3 Intuitive Apple Capsule Buttons ('원본 보기 ↗' · '다운로드' · '프레임 캡처') */}
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:gap-2.5">
            {/* 1. 원본 보기 ↗ (Apple Signature White Pill) */}
            <a
              href={externalSourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="원본 영상 새 탭에서 보기"
              className="inline-flex h-[clamp(38px,2.3vw,48px)] items-center justify-center gap-1.5 rounded-full bg-white px-[clamp(16px,1.1vw,22px)] text-[clamp(13.5px,0.84vw,16.5px)] font-semibold tracking-[-0.015em] text-[#111111] transition-colors hover:bg-white/90"
            >
              <span>원본 보기 ↗</span>
            </a>

            {/* 2. 다운로드 (Apple Dark Glass Pill) */}
            <button
              type="button"
              onClick={handleDownloadMp4}
              disabled={busyAction !== null}
              aria-label="원본 루프 영상 MP4 다운로드"
              className="inline-flex h-[clamp(38px,2.3vw,48px)] items-center justify-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.12] px-[clamp(16px,1.1vw,22px)] text-[clamp(13.5px,0.84vw,16.5px)] font-medium tracking-[-0.015em] text-white transition-colors hover:bg-white/[0.20] disabled:opacity-45"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-[clamp(16px,1.0vw,19px)] w-[clamp(16px,1.0vw,19px)]"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19h14"
                />
              </svg>
              <span>{busyAction === "download" ? "저장 중..." : "다운로드"}</span>
            </button>

            {/* 3. 프레임 캡처 (Apple Dark Glass Pill) */}
            <button
              type="button"
              onClick={handleCaptureCurrentFrame}
              disabled={busyAction !== null}
              aria-label="현재 프레임 PNG 캡처 및 클립보드 복사"
              className="inline-flex h-[clamp(38px,2.3vw,48px)] items-center justify-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.12] px-[clamp(16px,1.1vw,22px)] text-[clamp(13.5px,0.84vw,16.5px)] font-medium tracking-[-0.015em] text-white transition-colors hover:bg-white/[0.20] disabled:opacity-45"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-[clamp(16px,1.0vw,19px)] w-[clamp(16px,1.0vw,19px)]"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 8V6a2 2 0 0 1 2-2h2M4 16v2a2 2 0 0 0 2 2h2m8-16h2a2 2 0 0 1 2 2v2m-4 14h2a2 2 0 0 0 2-2v-2"
                />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <span>{busyAction === "capture" ? "캡처 중..." : "프레임 캡처"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
