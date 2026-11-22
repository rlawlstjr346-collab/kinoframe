"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { ArchiveItem, VaultBookmark, VaultFolder } from "@/types/archive";
import {
  formatDuration,
  formatPreciseTimestamp,
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
import { getBranchBySlug, getTechniquesForItem } from "@/lib/visual-techniques";
import { computeHighlightWindow } from "@/components/SlideMountCard";
import { globalVideoScheduler } from "@/lib/video-scheduler";

interface ViewfinderModalProps {
  item: ArchiveItem;
  allItems: ArchiveItem[];
  hasPrev: boolean;
  hasNext: boolean;
  isAuthenticated: boolean;
  isInBoard: boolean;
  isInCompare: boolean;
  compareFull: boolean;
  folders: VaultFolder[];
  existingBookmark?: VaultBookmark;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSelectItem: (item: ArchiveItem) => void;
  onSelectTechnique?: (slug: string) => void;
  onToggleBoard: (id: string, folderId?: string) => void;
  onToggleCompare: (id: string) => void;
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
  isInCompare,
  compareFull,
  folders,
  existingBookmark,
  onClose,
  onPrev,
  onNext,
  onSelectTechnique,
  onToggleBoard,
  onToggleCompare,
  onSaveToVault,
}: ViewfinderModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const initialJumpedRef = useRef<boolean>(false);

  const [currentTimeSec, setCurrentTimeSec] = useState<number>(0);
  const [selectedFolderId, setSelectedFolderId] = useState<string>(
    existingBookmark?.folderId || folders[0]?.id || "jp-vintage-cf"
  );
  const [boardPickerOpen, setBoardPickerOpen] = useState<boolean>(false);
  const [busyAction, setBusyAction] = useState<"raw" | "copy" | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const techniques = useMemo(() => getTechniquesForItem(item, 6), [item]);
  const categoryLabel = getCategoryLabel(resolveItemCategory(item));
  const countryLabel = getCountryLabel(resolveItemCountry(item));

  // Suspend background grid videos while lightbox is open so modal gets 100% socket bandwidth
  useEffect(() => {
    globalVideoScheduler.setSuspended(true);
    return () => {
      globalVideoScheduler.setSuspended(false);
    };
  }, []);

  useEffect(() => {
    initialJumpedRef.current = false;
    setCurrentTimeSec(0);
    setBoardPickerOpen(false);
    setToastMsg(null);
    setSelectedFolderId(
      existingBookmark?.folderId || folders[0]?.id || "jp-vintage-cf"
    );
  }, [item, existingBookmark, folders]);

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
  }, [onClose, onPrev, onNext, hasPrev, hasNext]);

  const flashToast = (msg: string) => {
    setToastMsg(msg);
    window.setTimeout(() => setToastMsg(null), 2400);
  };

  const timestampSuffix =
    item.mediaSource === "archive_mp4"
      ? `_${formatPreciseTimestamp(currentTimeSec).replace(/[:.]/g, "-")}`
      : "";

  const handleCopyFrameImage = async () => {
    setBusyAction("copy");
    try {
      const blob = await captureRawFramePngBlob(item, videoRef.current);
      const copied = await copyPngBlobToClipboard(blob);
      if (copied) {
        flashToast("프레임 이미지가 클립보드에 복사되었습니다");
      } else {
        downloadBlobAsPng(blob, `${item.id}_frame${timestampSuffix}.png`);
        flashToast("PNG 파일로 저장되었습니다");
      }
    } catch {
      flashToast("이미지 복사에 실패했습니다");
    } finally {
      setBusyAction(null);
    }
  };

  const handleDownloadRawPng = async () => {
    setBusyAction("raw");
    try {
      const blob = await captureRawFramePngBlob(item, videoRef.current);
      downloadBlobAsPng(blob, `${item.id}_frame${timestampSuffix}.png`);
      flashToast("원본 PNG 다운로드 완료");
    } catch {
      flashToast("다운로드에 실패했습니다");
    } finally {
      setBusyAction(null);
    }
  };

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
    const win = computeHighlightWindow(realDur);
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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label={`${item.titleKo} 상세 뷰`}
      onClick={onClose}
    >
      {/* Top-Right Close X (Kodak 500T Amber) */}
      <button
        type="button"
        onClick={onClose}
        aria-label="닫기"
        className="fixed right-4 top-4 z-[110] inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-[#111318]/90 text-[#F3A833] transition-colors hover:border-[#F3A833] hover:text-[#FFBE55]"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
        >
          <path strokeLinecap="round" d="M5 5l14 14M19 5L5 19" />
        </svg>
      </button>

      {/* Left / Right Instant Clip Navigation Chevrons */}
      {hasPrev && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPrev();
          }}
          aria-label="이전 클립"
          className="fixed left-2.5 top-1/2 z-[110] inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-[#111318]/80 text-[#FAF7F0]/85 transition-colors hover:border-[#F3A833] hover:text-[#F3A833] sm:left-4"
        >
          <svg viewBox="0 0 12 20" className="h-5 w-3.5" fill="currentColor">
            <polygon points="10.8 1.5 9.3 0 0 9.6 9.3 19.2 10.8 17.7 3 9.6 10.8 1.5" />
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
          className="fixed right-2.5 top-1/2 z-[110] inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-[#111318]/80 text-[#FAF7F0]/85 transition-colors hover:border-[#F3A833] hover:text-[#F3A833] sm:right-4"
        >
          <svg viewBox="0 0 12 20" className="h-5 w-3.5" fill="currentColor">
            <polygon points="1.2 17.7 2.7 19.2 12 9.6 2.7 0 1.2 1.5 9 9.6 1.2 17.7" />
          </svg>
        </button>
      )}

      {/* Centered Scrollable Viewport Wrapper */}
      <div
        className="relative z-[105] max-h-screen w-full overflow-y-auto px-3 py-8 sm:px-8 sm:py-10"
        onClick={onClose}
      >
        {/* Dark-Glass Theater Container (#111318 clearly separated from #000 backdrop) */}
        <div
          className="mx-auto w-[min(94vw,1120px)] rounded-[20px] bg-[#111318] p-5 shadow-[0_32px_100px_rgba(0,0,0,0.92)] ring-1 ring-white/[0.12] sm:p-7"
          onClick={(e) => e.stopPropagation()}
        >
          {/* TOP: 64vh Theater Media Stage + Right Circular Action Bar */}
          <div className="flex flex-col gap-3.5 lg:flex-row lg:items-center">
            <div className="relative flex w-full min-w-0 flex-1 items-center justify-center overflow-hidden rounded-[14px] bg-[#060709] ring-1 ring-white/[0.07]">
              {item.mediaSource === "archive_mp4" && item.previewVideoUrl ? (
                <video
                  key={item.id}
                  ref={videoRef}
                  src={item.previewVideoUrl}
                  poster={item.thumbnailUrl}
                  preload="auto"
                  controls
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
                  className="h-[min(64vh,600px)] w-full object-contain"
                />
              ) : (
                <img
                  key={item.id}
                  src={item.thumbnailUrl}
                  alt={item.titleKo}
                  className="h-auto max-h-[min(64vh,600px)] w-auto max-w-full object-contain"
                />
              )}
            </div>

            {/* Right (Mobile Bottom) Kodak 500T Amber Circular Action Bar */}
            <div className="flex shrink-0 items-center justify-end gap-2.5 lg:flex-col lg:justify-center">
              {/* 1. Solid #F3A833 Circle Save to Board */}
              <div className="relative">
                <button
                  type="button"
                  onClick={handleSaveBoardClick}
                  title={isInBoard ? "내 보드 관리" : "내 보드에 저장"}
                  aria-label={isInBoard ? "내 보드 관리" : "내 보드에 저장"}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#F3A833] bg-[#F3A833] text-black transition-colors hover:border-[#FFBE55] hover:bg-[#FFBE55]"
                >
                  {isInBoard ? (
                    <svg
                      viewBox="0 0 20 20"
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4.5 10.5l3.5 3.5 7.5-8"
                      />
                    </svg>
                  ) : (
                    <svg
                      viewBox="0 0 20 20"
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                    >
                      <path strokeLinecap="round" d="M10 4v12M4 10h12" />
                    </svg>
                  )}
                </button>

                {/* Board Picker Popover */}
                {isAuthenticated && boardPickerOpen && (
                  <div className="absolute bottom-12 right-0 z-30 w-60 rounded-[16px] border border-[#F3A833]/80 bg-[#111318] p-3.5 shadow-2xl lg:bottom-auto lg:right-12 lg:top-0">
                    <div className="mb-2 flex items-center justify-between text-[13px] font-semibold text-[#FAF7F0]">
                      <span>보드 선택</span>
                      {isInBoard && (
                        <button
                          type="button"
                          onClick={() => {
                            onToggleBoard(item.id);
                            setBoardPickerOpen(false);
                            flashToast("보드에서 제거됨");
                          }}
                          className="text-[12px] text-[#F3A833] hover:text-[#FFBE55] hover:underline"
                        >
                          저장 해제
                        </button>
                      )}
                    </div>
                    <ul className="max-h-44 overflow-y-auto">
                      {folders.map((folder) => {
                        const active =
                          isInBoard && selectedFolderId === folder.id;
                        return (
                          <li
                            key={folder.id}
                            className="border-b border-white/15 py-1.5 last:border-b-0"
                          >
                            <button
                              type="button"
                              onClick={() => handlePickFolder(folder.id)}
                              className="flex w-full items-center justify-between text-left text-[13px] text-[#FAF7F0] transition-colors hover:text-[#F3A833]"
                            >
                              <span className="truncate">{folder.name}</span>
                              <span className="ml-2 font-mono text-[12px] text-[#F3A833]">
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

              {/* 2. 1-Click Copy Frame */}
              <button
                type="button"
                onClick={handleCopyFrameImage}
                disabled={busyAction !== null}
                title="현재 프레임 클립보드 복사"
                aria-label="현재 프레임 클립보드 복사"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#F3A833] bg-[#060709] text-[#F3A833] transition-colors hover:bg-[#F3A833] hover:text-black disabled:opacity-40"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect x="9" y="9" width="11" height="11" rx="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              </button>

              {/* 3. Raw PNG Download */}
              <button
                type="button"
                onClick={handleDownloadRawPng}
                disabled={busyAction !== null}
                title="원본 PNG 다운로드"
                aria-label="원본 PNG 다운로드"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#F3A833] bg-[#060709] text-[#F3A833] transition-colors hover:bg-[#F3A833] hover:text-black disabled:opacity-40"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
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
              </button>

              {/* 4. Add/Remove Side-by-Side Compare */}
              <button
                type="button"
                onClick={() => {
                  onToggleCompare(item.id);
                  flashToast(
                    isInCompare ? "비교 슬롯 해제됨" : "좌우 비교에 담김"
                  );
                }}
                disabled={!isInCompare && compareFull}
                title={isInCompare ? "비교 슬롯 해제" : "좌우 비교에 담기"}
                aria-label={isInCompare ? "비교 슬롯 해제" : "좌우 비교에 담기"}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#F3A833] transition-colors disabled:opacity-35 ${
                  isInCompare
                    ? "bg-[#F3A833] text-black"
                    : "bg-[#060709] text-[#F3A833] hover:bg-[#F3A833] hover:text-black"
                }`}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect x="3" y="4" width="7" height="16" rx="1.5" />
                  <rect x="14" y="4" width="7" height="16" rx="1.5" />
                </svg>
              </button>
            </div>
          </div>

          {/* Inline Toast Feedback */}
          {toastMsg && (
            <div
              role="status"
              className="mt-3.5 rounded-full border border-[#F3A833]/60 bg-[#F3A833]/15 px-4 py-1.5 text-center text-[13px] font-medium text-[#FAF7F0]"
            >
              {toastMsg}
            </div>
          )}

          {/* BOTTOM: Cinema Metadata & Optical Taxonomy Tree Capsules */}
          <div className="mt-5 border-t border-white/[0.08] pt-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h1 className="text-[1.35rem] font-semibold leading-[1.3] text-[#FAF7F0] sm:text-[1.75rem] sm:leading-[2.15rem]">
                {item.titleKo}{" "}
                <span className="font-mono font-medium text-[#F3A833]">
                  ({item.year})
                </span>
              </h1>
              {item.mediaSource === "archive_mp4" && (
                <span className="font-mono text-[13px] text-[#C8C4BC]">
                  {formatPreciseTimestamp(currentTimeSec)} /{" "}
                  {formatDuration(item.durationSec)}
                </span>
              )}
            </div>

            <p className="mt-2 max-w-3xl text-[0.94rem] leading-[1.5] text-[#C8C4BC]">
              {item.originalTitle} — {item.breakdown.framing}
            </p>

            {/* Structured Credits */}
            <ul className="mt-4 grid gap-y-1.5 text-[0.88rem] text-[#FAF7F0] sm:grid-cols-2 sm:gap-x-6">
              <li>
                <span className="text-[#7E7B74]">Format — </span>
                <span>
                  {categoryLabel} ·{" "}
                  {item.mediaSource === "archive_mp4"
                    ? "Direct Loop Video"
                    : "Archival Still"}
                </span>
              </li>
              <li>
                <span className="text-[#7E7B74]">Decade / Region — </span>
                <span>
                  {item.era} · {countryLabel}
                </span>
              </li>
              <li>
                <span className="text-[#7E7B74]">Aspect / Runtime — </span>
                <span className="font-mono">
                  {item.aspectRatio} · {formatDuration(item.durationSec)}
                </span>
              </li>
              <li>
                <span className="text-[#7E7B74]">Original Source — </span>
                <a
                  href={item.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#F3A833] hover:text-[#FFBE55] hover:underline"
                >
                  Open Source Archive ↗
                </a>
              </li>
            </ul>

            {/* Bottom Optical Technique Tree Capsules (Click -> Navigate to Technique Tree View) */}
            <div className="mt-5 flex flex-wrap gap-2">
              {techniques.map((tech) => {
                const branch = getBranchBySlug(tech.branchSlug);
                return (
                  <button
                    key={`pill-${tech.slug}`}
                    type="button"
                    onClick={() => {
                      onSelectTechnique?.(tech.slug);
                      onClose();
                    }}
                    className="inline-flex items-center gap-1.5 rounded-[2rem] border border-[#F3A833] bg-[#F3A833] px-3.5 py-1.5 text-[0.78rem] font-semibold uppercase leading-none text-black transition-colors duration-200 hover:border-[#FFBE55] hover:bg-[#FFBE55]"
                  >
                    {branch && (
                      <span className="text-[0.68rem] font-medium opacity-70">
                        {branch.label} /
                      </span>
                    )}
                    <span>{tech.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
