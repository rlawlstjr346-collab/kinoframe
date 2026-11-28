"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { ArchiveItem } from "@/types/archive";
import {
  formatPreciseTimestamp,
  getCategoryLabel,
  getCountryLabel,
  resolveItemCategory,
  resolveItemCountry,
} from "@/lib/taxonomy";
import { captureRawFramePngBlob, downloadBlobAsPng, downloadVideoMp4, warmPngEncoder } from "@/lib/frame-capture";
import { getHighlightWindow } from "@/components/SlideMountCard";
import { globalVideoScheduler } from "@/lib/video-scheduler";
import { toStreamingMediaUrl } from "@/lib/media-url";
import { getCropLayerStyle, getVisibleAspect } from "@/lib/media-crop";
import { BoardBookmarkIcon, CopyIcon } from "@/components/Icons";

interface ViewfinderModalProps {
  item: ArchiveItem;
  hasPrev: boolean;
  hasNext: boolean;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  saved: boolean;
  onToggleBoard: (item: ArchiveItem) => void;
  onSelectTechnique: (tag: string) => void;
  onToast: (msg: string) => void;
}

const PILL =
  "inline-flex h-[var(--kf-control-h)] items-center justify-center gap-[0.45em] whitespace-nowrap rounded-full px-[clamp(14px,0.95vw,34px)] text-[length:var(--kf-text-ui)] font-medium tracking-[-0.015em] transition-[background-color,color,transform] duration-[160ms] ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.97] active:duration-[120ms] disabled:opacity-45";
const GLASS_PILL = `${PILL} border border-white/[0.09] bg-white/[0.10] text-white hover:bg-white/[0.18]`;
const ROUND_NAV =
  "inline-flex h-[clamp(40px,2.4vw,88px)] w-[clamp(40px,2.4vw,88px)] items-center justify-center rounded-full border border-white/[0.12] bg-[#1C1C1E]/80 text-white backdrop-blur-2xl transition-[background-color,transform] duration-[160ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-white/[0.2] active:scale-[0.95]";

function ChevronIcon({ dir }: { dir: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" className="h-[48%] w-[48%]" fill="none" stroke="currentColor" strokeWidth="2.1" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={dir === "left" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[44%] w-[44%]" fill="none" stroke="currentColor" strokeWidth="2.1" aria-hidden="true">
      <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/** Copies text; returns false when the Clipboard API is blocked. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
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
  saved,
  onToggleBoard,
  onSelectTechnique,
  onToast,
}: ViewfinderModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const initialJumpedRef = useRef<boolean>(false);

  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [userPaused, setUserPaused] = useState<boolean>(false);
  const [videoFailed, setVideoFailed] = useState<boolean>(false);
  const [busy, setBusy] = useState<"png" | null>(null);

  const { primaryTitle, subCaption } = useMemo(() => formatCleanModalMeta(item), [item]);
  const externalSourceUrl = useMemo(() => resolveValidSourceUrl(item), [item]);
  const videoSrc = toStreamingMediaUrl(item.previewVideoUrl);
  const hasVideo = item.mediaSource === "archive_mp4" && Boolean(videoSrc) && !videoFailed;
  const visibleAspect = getVisibleAspect(item);
  const category = resolveItemCategory(item);
  const country = resolveItemCountry(item);
  // Never stretch a clip past ~1.75x its own pixels (keeps SD archive loops sharp on 4K screens).
  const nativeVisibleWidth = Math.round((item.width || 1920) * (item.crop?.w ?? 1) * 1.75);

  // Suspend background wall videos while the theater is open
  useEffect(() => {
    globalVideoScheduler.setSuspended(true);
    closeRef.current?.focus();
    void warmPngEncoder();
    return () => globalVideoScheduler.setSuspended(false);
  }, []);

  useEffect(() => {
    initialJumpedRef.current = false;
    setIsPaused(false);
    setUserPaused(false);
    setVideoFailed(false);
  }, [item]);

  const togglePlayPause = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      setUserPaused(false);
      void v.play().catch(() => {});
    } else {
      v.pause();
      setUserPaused(true);
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT");
      if (e.key === "Escape") onClose();
      if (isTyping) return;
      if (e.key === " " && item.mediaSource === "archive_mp4" && target?.tagName !== "BUTTON") {
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

  const frameFilename = () => {
    const t = videoRef.current?.currentTime ?? 0;
    const suffix = item.mediaSource === "archive_mp4" ? `_${formatPreciseTimestamp(t).replace(/[:.]/g, "-")}` : "";
    return `kinoframe-${item.id}_frame${suffix}.png`;
  };

  const reportCapture = (label: string, startedAt: number) => {
    const ms = Math.max(1, Math.round(performance.now() - startedAt));
    dialogRef.current?.setAttribute("data-last-capture-ms", String(ms));
    onToast(`${label} · ${ms}ms`);
  };

  // Frame copy: the clipboard write starts synchronously inside the click (required by Safari),
  // with the PNG produced from the playing <video> (same-origin stream, no re-download).
  const handleCopyFrame = async () => {
    const startedAt = performance.now();
    // No busy state here: a re-render before the draw would only delay the capture.
    const blobPromise = captureRawFramePngBlob(item, videoRef.current);
    try {
      if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) throw new Error("NO_CLIPBOARD");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blobPromise })]);
      reportCapture("프레임을 클립보드에 복사했습니다", startedAt);
    } catch {
      try {
        downloadBlobAsPng(await blobPromise, frameFilename());
        reportCapture("클립보드 대신 PNG로 저장했습니다", startedAt);
      } catch {
        onToast("프레임을 캡처하지 못했습니다");
      }
    }
  };

  const handleSavePng = async () => {
    const startedAt = performance.now();
    setBusy("png");
    try {
      downloadBlobAsPng(await captureRawFramePngBlob(item, videoRef.current), frameFilename());
      reportCapture("프레임 PNG를 저장했습니다", startedAt);
    } catch {
      onToast("프레임을 캡처하지 못했습니다");
    } finally {
      setBusy(null);
    }
  };

  const handleDownloadMp4 = () => {
    try {
      downloadVideoMp4(item);
      onToast(`kinoframe-${item.id}.mp4 다운로드를 시작했습니다`);
    } catch {
      onToast("영상을 내려받지 못했습니다");
    }
  };

  const handleModalVideoMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    if (initialJumpedRef.current) return;
    initialJumpedRef.current = true;
    const realDur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : item.durationSec;
    if (realDur && realDur <= 6) return;
    const win = getHighlightWindow({ durationSec: realDur, startSec: item.startSec });
    if (win.startSec > 0 && realDur && realDur > win.startSec + 2) {
      try {
        video.currentTime = win.startSec;
      } catch {
        // ignore
      }
    }
  };

  const metaParts = [
    getCategoryLabel(category),
    String(item.year),
    country !== "GLOBAL" ? getCountryLabel(country) : null,
    item.width && item.height ? `${item.width}×${item.height}` : null,
  ].filter(Boolean) as string[];

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[100] overflow-y-auto bg-[#050506]/[0.92] animate-[kf-fade-in_200ms_cubic-bezier(0.4,0,0.2,1)]"
      role="dialog"
      aria-modal="true"
      aria-label={`${primaryTitle} 상세 뷰`}
      onClick={onClose}
    >
      {/* Desktop: viewport-edge navigation (never over the picture) */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[120] hidden justify-end p-[clamp(12px,0.8vw,32px)] lg:flex">
        <button ref={closeRef} type="button" onClick={onClose} aria-label="닫기" className={`pointer-events-auto ${ROUND_NAV}`}>
          <CloseIcon />
        </button>
      </div>
      {hasPrev && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPrev();
          }}
          aria-label="이전 클립"
          className={`fixed left-[clamp(6px,0.5vw,20px)] top-1/2 z-[120] hidden -translate-y-1/2 lg:inline-flex ${ROUND_NAV}`}
        >
          <ChevronIcon dir="left" />
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
          className={`fixed right-[clamp(6px,0.5vw,20px)] top-1/2 z-[120] hidden -translate-y-1/2 lg:inline-flex ${ROUND_NAV}`}
        >
          <ChevronIcon dir="right" />
        </button>
      )}

      <div className="flex min-h-full items-start justify-center px-3 py-3 sm:px-6 sm:py-6 lg:items-center">
        <section
          onClick={(e) => e.stopPropagation()}
          className="relative w-full rounded-[clamp(20px,1.3vw,48px)] border border-white/[0.1] bg-[#141416]/95 p-[clamp(10px,0.8vw,30px)] shadow-[0_40px_120px_rgba(0,0,0,0.88)] animate-[kf-sheet-in_280ms_cubic-bezier(0.16,1,0.3,1)] lg:w-[min(92vw,max(1680px,72vw))]"
        >
          {/* Phone / tablet: navigation lives in a top bar so it never covers the picture */}
          <div className="mb-2 flex items-center justify-between lg:hidden">
            <div className="flex gap-2">
              <button type="button" onClick={onPrev} disabled={!hasPrev} aria-label="이전 클립" className={`${ROUND_NAV} disabled:opacity-30`}>
                <ChevronIcon dir="left" />
              </button>
              <button type="button" onClick={onNext} disabled={!hasNext} aria-label="다음 클립" className={`${ROUND_NAV} disabled:opacity-30`}>
                <ChevronIcon dir="right" />
              </button>
            </div>
            <button type="button" onClick={onClose} aria-label="닫기" className={ROUND_NAV}>
              <CloseIcon />
            </button>
          </div>

          {/* Stage: visible picture only (letterbox/pillarbox bars cropped), never upscaled past 1.75x */}
          <div
            onClick={hasVideo ? togglePlayPause : undefined}
            className={`relative mx-auto overflow-hidden rounded-[clamp(14px,0.9vw,34px)] bg-[#0B0B0D] ${hasVideo ? "cursor-pointer" : ""}`}
            style={{
              aspectRatio: String(visibleAspect),
              width: `min(100%, calc(var(--kf-stage-h, 62vh) * ${visibleAspect.toFixed(4)}), ${nativeVisibleWidth}px)`,
            }}
          >
            <div style={getCropLayerStyle(item)}>
              {hasVideo ? (
                <video
                  key={item.id}
                  ref={videoRef}
                  src={videoSrc ?? undefined}
                  poster={toStreamingMediaUrl(item.thumbnailUrl) ?? undefined}
                  crossOrigin="anonymous"
                  preload="auto"
                  autoPlay
                  muted
                  loop
                  playsInline
                  onLoadedMetadata={handleModalVideoMetadata}
                  onPlay={() => {
                    setIsPaused(false);
                    setUserPaused(false);
                  }}
                  onPause={() => setIsPaused(true)}
                  onError={() => setVideoFailed(true)}
                  className="h-full w-full object-cover"
                />
              ) : (
                <img key={item.id} src={item.thumbnailUrl} alt={primaryTitle} className="h-full w-full object-cover" />
              )}
            </div>
            {userPaused && isPaused && (
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25">
                <span className="inline-flex h-[clamp(56px,4vw,140px)] w-[clamp(56px,4vw,140px)] items-center justify-center rounded-full border border-white/[0.18] bg-[#1C1C1E]/75 text-white backdrop-blur-xl">
                  <svg viewBox="0 0 24 24" className="h-[42%] w-[42%]" fill="currentColor">
                    <rect x="6.5" y="5" width="3.8" height="14" rx="1.2" />
                    <rect x="13.7" y="5" width="3.8" height="14" rx="1.2" />
                  </svg>
                </span>
              </div>
            )}
          </div>

          {/* Studio info */}
          <div className="mt-[clamp(12px,0.9vw,34px)] grid gap-x-[clamp(16px,1.6vw,64px)] gap-y-[clamp(12px,0.8vw,30px)] px-1 lg:grid-cols-[minmax(0,1fr)_auto] lg:px-2">
            <div className="min-w-0">
              <h1 className="text-[clamp(19px,1.35vw,50px)] font-semibold leading-[1.2] tracking-[-0.025em] text-[var(--kf-text)] [text-wrap:balance]">
                {primaryTitle}
              </h1>
              {subCaption && (
                <p className="mt-1 truncate text-[clamp(13px,0.85vw,30px)] tracking-[-0.01em] text-[var(--kf-text-secondary)]">{subCaption}</p>
              )}
              <p className="num mt-1.5 text-[clamp(11.5px,0.72vw,25px)] font-medium uppercase tracking-[0.05em] text-[var(--kf-text-muted)]">
                {metaParts.join("  ·  ")}
              </p>
            </div>

            {/* Actions: one clean row on desktop, an even 2-column grid on phones */}
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end lg:flex-nowrap">
              <button
                type="button"
                onClick={() => onToggleBoard(item)}
                aria-pressed={saved}
                className={`${PILL} ${
                  saved
                    ? "border border-[var(--kf-champagne)] bg-[rgba(200,158,82,0.16)] text-[#F0D9A6] hover:bg-[rgba(200,158,82,0.24)]"
                    : "border border-white/[0.09] bg-white/[0.10] text-white hover:bg-white/[0.18]"
                }`}
              >
                <BoardBookmarkIcon filled={saved} className="h-[var(--kf-icon)] w-[var(--kf-icon)]" />
                {saved ? "보드에 담김" : "보드에 담기"}
              </button>
              <a href={externalSourceUrl} target="_blank" rel="noopener noreferrer" aria-label="원본 영상 새 탭에서 보기" className={`${PILL} bg-[var(--kf-text)] font-semibold text-[#111111] hover:bg-white`}>
                원본 보기 ↗
              </a>
              <button type="button" onClick={handleCopyFrame} disabled={busy !== null} aria-label="현재 프레임을 클립보드에 복사" className={GLASS_PILL}>
                <CopyIcon className="h-[var(--kf-icon)] w-[var(--kf-icon)]" />
                프레임 복사
              </button>
              <button type="button" onClick={handleSavePng} disabled={busy !== null} aria-label="현재 프레임 PNG로 저장" className={GLASS_PILL}>
                <svg viewBox="0 0 24 24" className="h-[var(--kf-icon)] w-[var(--kf-icon)]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V6a2 2 0 0 1 2-2h2M4 16v2a2 2 0 0 0 2 2h2m8-16h2a2 2 0 0 1 2 2v2m-4 14h2a2 2 0 0 0 2-2v-2" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                PNG 저장
              </button>
              {item.mediaSource === "archive_mp4" && item.previewVideoUrl && (
                <button type="button" onClick={handleDownloadMp4} aria-label="5초 루프 MP4 다운로드" className={`${GLASS_PILL} col-span-2 sm:col-span-1`}>
                  <svg viewBox="0 0 24 24" className="h-[var(--kf-icon)] w-[var(--kf-icon)]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19h14" />
                  </svg>
                  MP4
                </button>
              )}
            </div>

            <div className="min-w-0">
              {item.directingNote && (
                <p className="max-w-[68ch] text-[clamp(14px,0.92vw,33px)] leading-[1.6] tracking-[-0.01em] text-[#D9D6CF]">{item.directingNote}</p>
              )}
              {item.opticsTags && item.opticsTags.length > 0 && (
                <ul className="mt-[clamp(8px,0.6vw,22px)] flex flex-wrap gap-[clamp(6px,0.4vw,14px)]" aria-label="광학·연출 태그 (누르면 벽면 필터)">
                  {item.opticsTags.map((tag) => (
                    <li key={tag}>
                      <button
                        type="button"
                        onClick={() => onSelectTechnique(tag)}
                        className="inline-flex h-[var(--kf-chip-h)] items-center rounded-full border border-white/[0.1] px-[clamp(11px,0.75vw,26px)] text-[length:var(--kf-text-chip)] text-[var(--kf-text-secondary)] transition-[border-color,color,transform] duration-[160ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-[var(--kf-champagne)] hover:text-[#F0D9A6] active:scale-[0.97]"
                      >
                        #{tag}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* 5-colour palette: click a swatch to copy its HEX */}
            <div className="w-full lg:min-w-[clamp(320px,24vw,880px)]" aria-label="시네마 컬러 팔레트 (누르면 HEX 복사)">
              <div className="flex h-[clamp(40px,2.6vw,96px)] overflow-hidden rounded-[clamp(10px,0.6vw,22px)] ring-1 ring-white/[0.1]">
                {item.palette.map((hex, i) => (
                  <button
                    key={`${hex}-${i}`}
                    type="button"
                    onClick={async () => onToast((await copyText(hex.toUpperCase())) ? `${hex.toUpperCase()} 복사됨` : "HEX를 복사하지 못했습니다")}
                    aria-label={`${hex.toUpperCase()} 복사`}
                    title={`${hex.toUpperCase()} 복사`}
                    style={{ backgroundColor: hex }}
                    className="h-full flex-1 origin-bottom transition-transform duration-[160ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-y-[1.04] focus-visible:z-[1] active:scale-y-[0.97]"
                  />
                ))}
              </div>
              <div className="mt-1.5 flex">
                {item.palette.map((hex, i) => (
                  <span key={`${hex}-label-${i}`} className="num flex-1 text-center font-mono text-[clamp(10.5px,0.62vw,22px)] uppercase tracking-[0.02em] text-[var(--kf-text-muted)]">
                    {hex}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
