"use client";

import React, { useEffect, useRef, useState } from "react";
import type { ArchiveItem, VaultBookmark, VaultFolder } from "@/types/archive";
import {
  formatPreciseTimestamp,
  resolveItemCategory,
} from "@/lib/taxonomy";
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
  allItems: ArchiveItem[];
  hasPrev: boolean;
  hasNext: boolean;
  isAuthenticated: boolean;
  isInBoard: boolean;
  folders: VaultFolder[];
  existingBookmark?: VaultBookmark;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSelectItem: (item: ArchiveItem) => void;
  onToggleBoard: (id: string, folderId?: string) => void;
  onSaveToVault: (payload: {
    itemId: string;
    folderId: string;
    timestampSec: number | null;
    memo: string;
  }) => void;
}

export function ViewfinderModal({
  item,
  hasPrev,
  hasNext,
  isAuthenticated,
  isInBoard,
  folders,
  existingBookmark,
  onClose,
  onPrev,
  onNext,
  onToggleBoard,
  onSaveToVault,
}: ViewfinderModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const initialJumpedRef = useRef<boolean>(false);

  const [currentTimeSec, setCurrentTimeSec] = useState<number>(0);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string>(
    existingBookmark?.folderId || folders[0]?.id || "jp-vintage-cf"
  );
  const [boardPickerOpen, setBoardPickerOpen] = useState<boolean>(false);
  const [busyAction, setBusyAction] = useState<"download" | "capture" | null>(
    null
  );
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const category = resolveItemCategory(item);
  const genreBadge = category === "TVCF" ? "TVCF" : "Cinema";

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
    setBoardPickerOpen(false);
    setToastMsg(null);
    setSelectedFolderId(
      existingBookmark?.folderId || folders[0]?.id || "jp-vintage-cf"
    );
  }, [item, existingBookmark, folders]);

  const togglePlayPause = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      void v.play().catch(() => {});
      setIsPaused(false);
    } else {
      v.pause();
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
    window.setTimeout(() => setToastMsg(null), 2600);
  };

  // Button 1: Save to My Board (AuthModal z-[140] auto-opens for guest + auto-saves on login)
  const handleSaveBoardClick = () => {
    if (!isAuthenticated) {
      onToggleBoard(item.id, selectedFolderId);
      return;
    }
    if (folders.length > 1) {
      setBoardPickerOpen((prev) => !prev);
      if (!isInBoard) {
        onToggleBoard(item.id, selectedFolderId);
        flashToast("내 보드에 저장됨");
      }
    } else {
      onToggleBoard(item.id, selectedFolderId);
      flashToast(isInBoard ? "보드에서 제거됨" : "내 보드에 저장됨");
    }
  };

  const handlePickFolder = (folderId: string) => {
    setSelectedFolderId(folderId);
    const ts = item.mediaSource === "archive_mp4" ? currentTimeSec : null;
    onSaveToVault({
      itemId: item.id,
      folderId,
      timestampSec: ts,
      memo: existingBookmark?.memo || "",
    });
    const folderName = folders.find((f) => f.id === folderId)?.name;
    flashToast(folderName ? `'${folderName}' 보드에 저장됨` : "보드에 저장됨");
    setBoardPickerOpen(false);
  };

  // Button 2: Download original loop video (.mp4) as kinoframe-<id>.mp4
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

  // Button 3: Capture current live <video> frame at video.currentTime -> BOTH .png download AND clipboard image copy
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
        flashToast("현재 프레임 PNG 저장 및 클립보드 복사 완료");
      } else {
        flashToast(`현재 프레임 PNG 저장 완료 (${filename})`);
      }
    } catch {
      flashToast("현재 프레임 캡처에 실패했습니다");
    } finally {
      setBusyAction(null);
    }
  };

  const handleModalVideoMetadata = (
    e: React.SyntheticEvent<HTMLVideoElement>
  ) => {
    if (initialJumpedRef.current) return;
    initialJumpedRef.current = true;
    const video = e.currentTarget;
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

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0A0B0E]/88 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label={`${item.titleKo} 상세 뷰`}
      onClick={onClose}
    >
      {/* Top-Right Fluid Large Close Button */}
      <button
        type="button"
        onClick={onClose}
        aria-label="닫기"
        className="fixed right-[clamp(16px,1.5vw,32px)] top-[clamp(16px,1.5vw,32px)] z-[120] inline-flex h-[clamp(46px,3vw,64px)] w-[clamp(46px,3vw,64px)] items-center justify-center rounded-full bg-white/[0.10] text-[#F2EFE9] ring-1 ring-white/[0.18] backdrop-blur-md transition-colors hover:bg-[#C89E52] hover:text-[#0A0B0E]"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-[clamp(22px,1.4vw,30px)] w-[clamp(22px,1.4vw,30px)]"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
        >
          <path strokeLinecap="round" d="M5 5l14 14M19 5L5 19" />
        </svg>
      </button>

      {/* Left / Right Fluid Navigation Chevrons */}
      {hasPrev && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPrev();
          }}
          aria-label="이전 클립"
          className="fixed left-[clamp(12px,1.4vw,32px)] top-1/2 z-[120] inline-flex h-[clamp(52px,3.4vw,76px)] w-[clamp(52px,3.4vw,76px)] -translate-y-1/2 items-center justify-center rounded-full bg-white/[0.10] text-[#F2EFE9] ring-1 ring-white/[0.18] backdrop-blur-md transition-colors hover:bg-[#C89E52] hover:text-[#0A0B0E]"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-[clamp(24px,1.6vw,36px)] w-[clamp(24px,1.6vw,36px)]"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
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
          className="fixed right-[clamp(12px,1.4vw,32px)] top-1/2 z-[120] inline-flex h-[clamp(52px,3.4vw,76px)] w-[clamp(52px,3.4vw,76px)] -translate-y-1/2 items-center justify-center rounded-full bg-white/[0.10] text-[#F2EFE9] ring-1 ring-white/[0.18] backdrop-blur-md transition-colors hover:bg-[#C89E52] hover:text-[#0A0B0E]"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-[clamp(24px,1.6vw,36px)] w-[clamp(24px,1.6vw,36px)]"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      )}

      {/* Fluid FHD/QHD/4K Theater Container */}
      <div
        className="relative z-[105] flex max-h-screen w-full items-center justify-center p-3 sm:p-6"
        onClick={onClose}
      >
        <div
          className="max-h-[94vh] w-[min(86vw,2800px)] overflow-y-auto rounded-[24px] bg-[#111318] p-5 shadow-[0_32px_100px_rgba(0,0,0,0.92)] ring-1 ring-white/[0.14] sm:p-7 xl:p-9"
          onClick={(e) => e.stopPropagation()}
        >
          {/* PURE CHROME-FREE CINEMA STAGE (Click / Space to toggle Play/Pause) */}
          <div
            onClick={
              item.mediaSource === "archive_mp4" && item.previewVideoUrl
                ? togglePlayPause
                : undefined
            }
            className={`relative flex w-full items-center justify-center overflow-hidden rounded-[18px] bg-[#060709] ring-1 ring-white/[0.08] ${
              item.mediaSource === "archive_mp4" && item.previewVideoUrl
                ? "cursor-pointer"
                : ""
            }`}
          >
            {item.mediaSource === "archive_mp4" && item.previewVideoUrl ? (
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
                  onPlay={() => setIsPaused(false)}
                  onPause={() => setIsPaused(true)}
                  className="h-[min(75vh,1360px)] w-full object-contain"
                />
                {isPaused && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#0A0B0E]/30"
                  >
                    <span className="inline-flex h-[clamp(64px,4.5vw,96px)] w-[clamp(64px,4.5vw,96px)] items-center justify-center rounded-full bg-[#0A0B0E]/75 text-[#C89E52] ring-1 ring-[#C89E52]/60 backdrop-blur-sm">
                      <svg
                        viewBox="0 0 24 24"
                        className="ml-1 h-[clamp(28px,2vw,42px)] w-[clamp(28px,2vw,42px)]"
                        fill="currentColor"
                      >
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </span>
                  </div>
                )}
              </>
            ) : (
              <img
                key={item.id}
                src={item.thumbnailUrl}
                alt={item.titleKo}
                className="h-[min(75vh,1360px)] w-full object-contain"
              />
            )}
          </div>

          {/* Inline Toast Feedback */}
          {toastMsg && (
            <div
              role="status"
              className="mt-4 rounded-full border border-[#C89E52]/60 bg-[#C89E52]/15 px-6 py-2.5 text-center text-[clamp(14px,0.9vw,18px)] font-medium text-[#F2EFE9]"
            >
              {toastMsg}
            </div>
          )}

          {/* BOTTOM CONTROL BAR: Left Work Title + Right 3 Fluid Action Buttons */}
          <div className="mt-5 flex flex-col gap-4 border-t border-white/[0.10] pt-5 lg:flex-row lg:items-center lg:justify-between">
            {/* Left: Genre Badge + Single Large Bold Work Title + Year + Source Link */}
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <span className="inline-flex shrink-0 items-center rounded-full bg-[#C89E52] px-3.5 py-1 font-mono text-[clamp(0.85rem,0.85vw,1.15rem)] font-bold uppercase tracking-wider text-[#0A0B0E]">
                {genreBadge}
              </span>
              <h1 className="truncate text-[clamp(1.25rem,1.45vw,2.15rem)] font-bold leading-tight tracking-tight text-[#F2EFE9]">
                {item.titleKo}
              </h1>
              <span className="shrink-0 font-mono text-[clamp(1.05rem,1.1vw,1.6rem)] font-semibold text-[#C89E52]">
                ({item.year})
              </span>
              <a
                href={item.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-1 shrink-0 text-[clamp(0.85rem,0.85vw,1.15rem)] font-medium text-[#C8C4BC] transition-colors hover:text-[#C89E52] hover:underline"
              >
                원본 ↗
              </a>
            </div>

            {/* Right: Strictly 3 Fluid Action Buttons Left-to-Right ('저장' · '다운로드' · '현재 프레임 캡처') */}
            <div className="flex shrink-0 flex-wrap items-center gap-3">
              {/* 1. 저장 / 저장됨 ✓ (Anodized Champagne Brass Solid) */}
              <div className="relative">
                <button
                  type="button"
                  onClick={handleSaveBoardClick}
                  aria-label={isInBoard ? "내 보드 관리" : "내 보드에 저장"}
                  className="inline-flex h-[clamp(46px,3.1vw,64px)] items-center justify-center gap-2.5 rounded-full bg-[#C89E52] px-[clamp(20px,1.5vw,34px)] text-[clamp(15px,0.95vw,20px)] font-semibold text-[#0A0B0E] transition-colors hover:bg-[#D9B36A]"
                >
                  {isInBoard ? (
                    <span>저장됨 ✓</span>
                  ) : (
                    <>
                      <svg
                        viewBox="0 0 24 24"
                        className="h-[clamp(20px,1.2vw,26px)] w-[clamp(20px,1.2vw,26px)]"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 4h14a1 1 0 0 1 1 1v16l-8-4.5L4 21V5a1 1 0 0 1 1-1z"
                        />
                      </svg>
                      <span>저장</span>
                    </>
                  )}
                </button>

                {isAuthenticated && boardPickerOpen && (
                  <div className="absolute bottom-[calc(100%+12px)] left-0 z-30 w-72 rounded-[16px] border border-[#C89E52]/80 bg-[#111318] p-4 shadow-2xl lg:left-auto lg:right-0">
                    <div className="mb-2.5 flex items-center justify-between text-[15px] font-semibold text-[#F2EFE9]">
                      <span>보드 선택</span>
                      {isInBoard && (
                        <button
                          type="button"
                          onClick={() => {
                            onToggleBoard(item.id);
                            setBoardPickerOpen(false);
                            flashToast("보드에서 제거됨");
                          }}
                          className="text-[13px] text-[#C89E52] hover:text-[#D9B36A] hover:underline"
                        >
                          저장 해제
                        </button>
                      )}
                    </div>
                    <ul className="max-h-52 overflow-y-auto">
                      {folders.map((folder) => {
                        const active =
                          isInBoard && selectedFolderId === folder.id;
                        return (
                          <li
                            key={folder.id}
                            className="border-b border-white/15 py-2.5 last:border-b-0"
                          >
                            <button
                              type="button"
                              onClick={() => handlePickFolder(folder.id)}
                              className="flex w-full items-center justify-between text-left text-[15px] text-[#F2EFE9] transition-colors hover:text-[#C89E52]"
                            >
                              <span className="truncate">{folder.name}</span>
                              <span className="ml-2 font-mono text-[13px] text-[#C89E52]">
                                {active ? "SAVED" : "+"}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>

              {/* 2. 다운로드 (Original Loop .mp4 -> kinoframe-<id>.mp4) */}
              <button
                type="button"
                onClick={handleDownloadMp4}
                disabled={busyAction !== null}
                aria-label="원본 루프 영상 MP4 다운로드"
                className="inline-flex h-[clamp(46px,3.1vw,64px)] items-center justify-center gap-2.5 rounded-full bg-white/[0.08] px-[clamp(20px,1.5vw,34px)] text-[clamp(15px,0.95vw,20px)] font-semibold text-[#F2EFE9] ring-1 ring-white/[0.14] transition-colors hover:bg-white/[0.16] disabled:opacity-40"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-[clamp(20px,1.2vw,26px)] w-[clamp(20px,1.2vw,26px)] text-[#C89E52]"
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
                <span>
                  {busyAction === "download" ? "다운로드 중..." : "다운로드"}
                </span>
              </button>

              {/* 3. 현재 프레임 캡처 (High-res Canvas PNG download + clipboard image copy simultaneously) */}
              <button
                type="button"
                onClick={handleCaptureCurrentFrame}
                disabled={busyAction !== null}
                aria-label="현재 프레임 PNG 캡처 및 클립보드 복사"
                className="inline-flex h-[clamp(46px,3.1vw,64px)] items-center justify-center gap-2.5 rounded-full bg-white/[0.08] px-[clamp(20px,1.5vw,34px)] text-[clamp(15px,0.95vw,20px)] font-semibold text-[#F2EFE9] ring-1 ring-white/[0.14] transition-colors hover:bg-white/[0.16] disabled:opacity-40"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-[clamp(20px,1.2vw,26px)] w-[clamp(20px,1.2vw,26px)] text-[#C89E52]"
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
                <span>
                  {busyAction === "capture"
                    ? "캡처 중..."
                    : "현재 프레임 캡처"}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
