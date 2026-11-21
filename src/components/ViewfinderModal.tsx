"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ArchiveItem,
  AspectRatio,
  CompositionTag,
  OverlayVisibility,
  PersuasionTag,
  VaultBookmark,
  VaultFolder,
} from "@/types/archive";
import {
  findRelatedArchiveItems,
  formatPreciseTimestamp,
  getAspectRatioClass,
} from "@/lib/taxonomy";
import { buildMediaProxyUrl } from "@/lib/media-allowlist";
import {
  captureRawFramePngBlob,
  captureReferenceCardPngBlob,
  copyPngBlobToClipboard,
  downloadBlobAsPng,
} from "@/lib/frame-capture";
import { ViewfinderOverlay } from "@/components/ViewfinderOverlay";
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  ExternalLinkIcon,
  PlayIcon,
  ViewfinderIcon,
} from "@/components/Icons";

interface ViewfinderModalProps {
  item: ArchiveItem;
  allItems: ArchiveItem[];
  hasPrev: boolean;
  hasNext: boolean;
  isInBoard: boolean;
  isInCompare: boolean;
  compareFull: boolean;
  folders: VaultFolder[];
  existingBookmark?: VaultBookmark;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSelectItem: (item: ArchiveItem) => void;
  onToggleBoard: (id: string) => void;
  onToggleCompare: (id: string) => void;
  onSaveToVault: (payload: {
    itemId: string;
    folderId: string;
    timestampSec: number | null;
    memo: string;
  }) => void;
  onCreateFolder: (name: string) => string;
  onSelectCompositionTag?: (tag: CompositionTag) => void;
  onSelectPersuasionTag?: (tag: PersuasionTag) => void;
}

const OFF_OVERLAY: OverlayVisibility = {
  perspective: false,
  thirds: false,
  symmetry: false,
  eyePath: false,
};

function getPrimaryOverlay(item: ArchiveItem): OverlayVisibility {
  return {
    perspective: item.viewfinder.primaryGrid === "perspective",
    thirds:
      item.viewfinder.primaryGrid === "thirds" ||
      item.viewfinder.primaryGrid === "golden",
    symmetry: item.viewfinder.primaryGrid === "symmetry",
    eyePath: true,
  };
}

function getNumericAspectRatio(ratio: AspectRatio): number {
  switch (ratio) {
    case "4:3":
      return 4 / 3;
    case "3:2":
      return 3 / 2;
    case "4:5":
      return 4 / 5;
    case "16:9":
      return 16 / 9;
    case "2.39:1":
      return 2.39;
  }
}

const OPTIMAL_OVERLAY_OPACITY = 0.88;

export function ViewfinderModal({
  item,
  allItems,
  hasPrev,
  hasNext,
  isInBoard,
  isInCompare,
  compareFull,
  folders,
  existingBookmark,
  onClose,
  onPrev,
  onNext,
  onSelectItem,
  onToggleBoard,
  onToggleCompare,
  onSaveToVault,
  onSelectCompositionTag,
  onSelectPersuasionTag,
}: ViewfinderModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Optical viewfinder grid strictly OFF on initial open & frame switch
  const [overlay, setOverlay] = useState<OverlayVisibility>(OFF_OVERLAY);
  const [youtubeActive, setYoutubeActive] = useState<boolean>(false);
  const [useDirectVideoFallback, setUseDirectVideoFallback] =
    useState<boolean>(false);
  const [currentTimeSec, setCurrentTimeSec] = useState<number>(0);
  const [copiedHex, setCopiedHex] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<"raw" | "card" | "copy" | null>(
    null
  );
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const isGridActive =
    overlay.perspective ||
    overlay.thirds ||
    overlay.symmetry ||
    overlay.eyePath;

  const relatedItems = useMemo(
    () => findRelatedArchiveItems(item, allItems, 4),
    [item, allItems]
  );

  useEffect(() => {
    setOverlay(OFF_OVERLAY);
    setYoutubeActive(false);
    setUseDirectVideoFallback(false);
    setCurrentTimeSec(0);
    setCopiedHex(null);
    setToastMsg(null);
  }, [item]);

  const handleToggleMasterGrid = useCallback(() => {
    setOverlay((prev) => {
      const anyOn =
        prev.perspective || prev.thirds || prev.symmetry || prev.eyePath;
      return anyOn ? OFF_OVERLAY : getPrimaryOverlay(item);
    });
  }, [item]);

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
      if (
        (e.key === "g" || e.key === "G") &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        e.preventDefault();
        handleToggleMasterGrid();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, onPrev, onNext, hasPrev, hasNext, handleToggleMasterGrid]);

  const toggleLayer = (key: keyof OverlayVisibility) => {
    setOverlay((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const flashToast = (msg: string) => {
    setToastMsg(msg);
    window.setTimeout(() => setToastMsg(null), 2600);
  };

  const handleCopyHex = async (hex: string) => {
    try {
      await navigator.clipboard.writeText(hex);
    } catch {
      // ignore clipboard errors
    }
    setCopiedHex(hex);
    flashToast(`${hex} 복사됨`);
    window.setTimeout(() => setCopiedHex(null), 1800);
  };

  const timestampSuffix =
    item.mediaSource === "archive_mp4"
      ? `_${formatPreciseTimestamp(currentTimeSec).replace(/[:.]/g, "-")}`
      : "";

  const handleDownloadRawPng = async () => {
    setBusyAction("raw");
    try {
      const blob = await captureRawFramePngBlob(item, videoRef.current);
      downloadBlobAsPng(blob, `${item.id}_frame${timestampSuffix}.png`);
      flashToast("현재 장면 PNG 저장 완료");
    } catch {
      flashToast("PNG 추출에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setBusyAction(null);
    }
  };

  const handleDownloadReferenceCardPng = async () => {
    setBusyAction("card");
    try {
      const ts = item.mediaSource === "archive_mp4" ? currentTimeSec : null;
      const blob = await captureReferenceCardPngBlob(item, videoRef.current, ts);
      downloadBlobAsPng(blob, `${item.id}_reference_card${timestampSuffix}.png`);
      flashToast("레퍼런스 카드 PNG 저장 완료");
    } catch {
      flashToast("카드형 PNG 생성에 실패했습니다.");
    } finally {
      setBusyAction(null);
    }
  };

  const handleCopyFrameImage = async () => {
    setBusyAction("copy");
    try {
      const blob = await captureRawFramePngBlob(item, videoRef.current);
      const copied = await copyPngBlobToClipboard(blob);
      if (copied) {
        flashToast("클립보드에 PNG 이미지 복사됨");
      } else {
        downloadBlobAsPng(blob, `${item.id}_frame${timestampSuffix}.png`);
        flashToast("PNG 파일로 저장되었습니다");
      }
    } catch {
      flashToast("이미지 복사에 실패했습니다.");
    } finally {
      setBusyAction(null);
    }
  };

  const handleSelectFolderPill = (folderId: string) => {
    const ts = item.mediaSource === "archive_mp4" ? currentTimeSec : null;
    onSaveToVault({
      itemId: item.id,
      folderId,
      timestampSec: ts,
      memo: existingBookmark?.memo || "",
    });
    const fName = folders.find((f) => f.id === folderId)?.name;
    if (fName) flashToast(`'${fName}' 폴더에 정리됨`);
  };

  const videoSrc =
    item.mediaSource === "archive_mp4" && item.previewVideoUrl
      ? useDirectVideoFallback
        ? item.previewVideoUrl
        : buildMediaProxyUrl(item.previewVideoUrl)
      : null;

  const numericRatio = getNumericAspectRatio(item.aspectRatio);
  const activeFolderId = existingBookmark?.folderId || folders[0]?.id;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#050507]/94 backdrop-blur-xl"
      role="dialog"
      aria-modal="true"
      aria-label={`${item.titleKo} 시어터 뷰`}
      onClick={onClose}
    >
      <div
        className="flex h-[92vh] w-[96vw] max-w-[2160px] flex-col overflow-hidden rounded-xl border border-white/[0.09] bg-[#0B0C0F] shadow-2xl lg:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        {/* LEFT: Full-Scale ShotDeck Theater Media Stage */}
        <div className="relative flex h-[46vh] min-w-0 flex-1 items-center justify-center overflow-hidden bg-[#060608] p-4 [--stage-h:38vh] sm:p-8 lg:h-full lg:p-10 lg:[--stage-h:80vh]">
          {/* Top-Left Minimal Glass Pill: Viewfinder Guide Toggle (Default OFF) */}
          <div className="absolute left-4 top-4 z-30 flex flex-wrap items-center gap-1.5 sm:left-6 sm:top-5">
            <button
              type="button"
              onClick={handleToggleMasterGrid}
              aria-pressed={isGridActive}
              className={`inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[13px] font-medium backdrop-blur-md transition-colors ${
                isGridActive
                  ? "border-[#F4F1EA]/40 bg-[#F4F1EA]/15 text-[#FAF8F5]"
                  : "border-white/[0.12] bg-[#0B0C0F]/75 text-[#E6E2D8] hover:border-white/30 hover:text-white"
              }`}
            >
              <ViewfinderIcon className="h-3.5 w-3.5" />
              <span>뷰파인더 가이드 · G</span>
            </button>

            {isGridActive && (
              <div
                className="flex items-center gap-1 rounded-full border border-white/[0.1] bg-[#0B0C0F]/80 px-1.5 py-1 backdrop-blur-md"
                role="group"
                aria-label="구도 가이드 세부 전환"
              >
                {(
                  [
                    ["perspective", "투시"],
                    ["thirds", "삼분할"],
                    ["symmetry", "대칭"],
                    ["eyePath", "시선"],
                  ] as Array<[keyof OverlayVisibility, string]>
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleLayer(key)}
                    aria-pressed={overlay[key]}
                    className={`rounded-full px-2.5 py-0.5 text-[12px] font-medium transition-colors ${
                      overlay[key]
                        ? "bg-[#F4F1EA] text-[#09090B]"
                        : "text-[#C8C3B8] hover:text-white"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Top-Right Minimal Glass Prev / Next Arrows */}
          <div className="absolute right-4 top-4 z-30 flex items-center gap-1.5 sm:right-6 sm:top-5">
            <button
              type="button"
              onClick={onPrev}
              disabled={!hasPrev}
              aria-label="이전 작품"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.12] bg-[#0B0C0F]/75 text-[#E6E2D8] backdrop-blur-md transition-colors hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={!hasNext}
              aria-label="다음 작품"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.12] bg-[#0B0C0F]/75 text-[#E6E2D8] backdrop-blur-md transition-colors hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>

          {/* Explicit Aspect-Ratio Locked Full-Scale Media Wrapper (88~94% Stage Fill) */}
          <div
            className={`relative max-h-full overflow-hidden rounded-[4px] bg-black shadow-[0_24px_80px_rgba(0,0,0,0.85)] ${getAspectRatioClass(
              item.aspectRatio
            )}`}
            style={{
              width: `min(100%, calc(var(--stage-h) * ${numericRatio}))`,
            }}
          >
            {item.mediaSource === "archive_mp4" && videoSrc ? (
              <video
                ref={videoRef}
                src={videoSrc}
                poster={item.thumbnailUrl}
                crossOrigin="anonymous"
                controls
                autoPlay
                muted
                loop
                playsInline
                onTimeUpdate={(e) =>
                  setCurrentTimeSec(e.currentTarget.currentTime)
                }
                onSeeked={(e) =>
                  setCurrentTimeSec(e.currentTarget.currentTime)
                }
                onError={() => {
                  if (!useDirectVideoFallback) {
                    setUseDirectVideoFallback(true);
                  }
                }}
                className="h-full w-full bg-black object-contain"
              />
            ) : item.mediaSource === "youtube_embed" && item.youtubeId ? (
              youtubeActive ? (
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${item.youtubeId}?autoplay=1&rel=0`}
                  title={item.titleKo}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="h-full w-full border-0"
                />
              ) : (
                <div className="relative h-full w-full bg-black">
                  <img
                    src={item.thumbnailUrl}
                    alt={item.titleKo}
                    className="h-full w-full object-contain"
                  />
                  <button
                    type="button"
                    onClick={() => setYoutubeActive(true)}
                    className="absolute inset-0 flex items-center justify-center bg-[#09090B]/22 transition-colors hover:bg-[#09090B]/10"
                    aria-label="YouTube 아카이브 영상 재생"
                  >
                    <span className="inline-flex items-center gap-2 rounded-full border border-[#F4F1EA]/40 bg-[#09090B]/85 px-5 py-2.5 text-[14px] font-semibold text-[#FAF8F5] shadow-xl backdrop-blur-md">
                      <PlayIcon className="h-4 w-4 text-[#D99B26]" />
                      영상 재생
                    </span>
                  </button>
                </div>
              )
            ) : (
              <img
                src={item.thumbnailUrl}
                alt={item.titleKo}
                className="h-full w-full object-contain"
              />
            )}

            {/* 1:1 Precision Optical Viewfinder Overlay Inside Exact Frame Bounds */}
            {!youtubeActive && (
              <ViewfinderOverlay
                viewfinder={item.viewfinder}
                visibility={overlay}
                opacity={OPTIMAL_OVERLAY_OPACITY}
              />
            )}
          </div>

          {item.mediaSource === "youtube_embed" && youtubeActive && (
            <button
              type="button"
              onClick={() => setYoutubeActive(false)}
              className="absolute bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-full border border-white/15 bg-[#0B0C0F]/85 px-4 py-1.5 text-[13px] font-medium text-[#FAF8F5] backdrop-blur-md hover:border-white/35"
            >
              스틸 프레임으로 돌아가기
            </button>
          )}
        </div>

        {/* RIGHT: Single High-Contrast Editorial Sheet (Zero Tabs, Apple HIG / Cosmos Hierarchy) */}
        <aside className="flex h-full w-full shrink-0 flex-col justify-between overflow-y-auto border-t border-white/[0.08] bg-[#0E0F13] px-6 py-6 sm:px-8 sm:py-7 lg:w-[440px] lg:border-l lg:border-t-0 xl:w-[480px]">
          <div className="space-y-6">
            {/* 1. Top One-Click Action Bar */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-mono text-[13px] font-medium text-[#D0CBC0]">
                  <span>
                    {item.mediaType} · {item.year}
                  </span>
                  {item.mediaSource === "archive_mp4" && (
                    <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[11px] text-[#E5A93B]">
                      {formatPreciseTimestamp(currentTimeSec)}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleDownloadRawPng}
                    disabled={busyAction !== null}
                    className="inline-flex h-9 items-center rounded-full border border-white/10 bg-[#1A1C23] px-3.5 text-[13px] font-medium text-[#FAF8F5] transition-colors hover:bg-[#242730] disabled:opacity-50"
                  >
                    {busyAction === "raw" ? "저장 중..." : "PNG 저장"}
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadReferenceCardPng}
                    disabled={busyAction !== null}
                    title="컬러칩과 분석이 포함된 1600px 레퍼런스 카드 PNG 저장"
                    className="inline-flex h-9 items-center rounded-full border border-white/[0.08] bg-transparent px-2.5 text-[12px] font-medium text-[#C8C3B8] transition-colors hover:border-white/20 hover:text-[#FAF8F5] disabled:opacity-50"
                  >
                    {busyAction === "card" ? "..." : "카드 PNG"}
                  </button>

                  <button
                    type="button"
                    onClick={() => onToggleBoard(item.id)}
                    className={`inline-flex h-9 items-center gap-1 rounded-full px-4 text-[13px] font-semibold transition-colors ${
                      isInBoard
                        ? "bg-[#D99B26] text-[#09090B] hover:bg-[#e5aa38]"
                        : "bg-[#F4F1EA] text-[#09090B] hover:bg-white"
                    }`}
                  >
                    {isInBoard ? (
                      <>
                        <span>보관됨</span>
                        <CheckIcon className="h-3.5 w-3.5" />
                      </>
                    ) : (
                      <span>보관</span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="닫기"
                    className="ml-0.5 inline-flex h-9 w-9 items-center justify-center rounded-full text-[#C8C3B8] transition-colors hover:bg-white/[0.08] hover:text-white"
                  >
                    <CloseIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Minimal 1-Line Folder Pill Strip (Only Visible When Saved) */}
              {isInBoard && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[12px] font-medium text-[#B8B3A8]">
                    폴더
                  </span>
                  {folders.map((folder) => {
                    const selected = activeFolderId === folder.id;
                    return (
                      <button
                        key={folder.id}
                        type="button"
                        onClick={() => handleSelectFolderPill(folder.id)}
                        className={`rounded-full px-2.5 py-0.5 text-[12px] font-medium transition-colors ${
                          selected
                            ? "bg-[#E5A93B]/20 text-[#E5A93B] ring-1 ring-[#E5A93B]/50"
                            : "bg-white/[0.05] text-[#C8C3B8] hover:text-white"
                        }`}
                      >
                        {folder.name}
                      </button>
                    );
                  })}
                </div>
              )}

              {toastMsg && (
                <div
                  role="status"
                  className="rounded-lg bg-[#E5A93B]/15 px-3.5 py-2 text-[13px] font-medium text-[#FAF8F5] ring-1 ring-[#E5A93B]/40"
                >
                  {toastMsg}
                </div>
              )}
            </div>

            {/* 2. Large High-Contrast Editorial Title */}
            <div>
              <h2 className="text-[22px] font-bold leading-[1.32] tracking-[-0.02em] text-[#FAF8F5] sm:text-[25px]">
                {item.titleKo}
              </h2>
              <p className="mt-2 text-[14px] leading-snug text-[#C8C3B8]">
                {item.brandOrSource} · {item.originalTitle}
              </p>
            </div>

            {/* 3. Text-Free Wide 48px Color Swatch Bar (Hover Expands + Centered HEX) */}
            <div>
              <div className="flex h-12 w-full overflow-hidden rounded-lg ring-1 ring-white/10">
                {item.palette.map((hex, idx) => (
                  <button
                    key={`${item.id}-sw-${idx}`}
                    type="button"
                    onClick={() => handleCopyHex(hex)}
                    title={`${hex} 복사`}
                    aria-label={`컬러 ${hex} 복사`}
                    className="group/swatch relative flex flex-1 items-center justify-center transition-all duration-200 hover:flex-[1.4] focus-visible:flex-[1.4]"
                    style={{ backgroundColor: hex }}
                  >
                    <span
                      className={`rounded bg-[#09090B]/78 px-2 py-0.5 font-mono text-[12px] font-medium text-[#FAF8F5] backdrop-blur-sm transition-opacity ${
                        copiedHex === hex
                          ? "opacity-100"
                          : "opacity-0 group-hover/swatch:opacity-100 group-focus-visible/swatch:opacity-100"
                      }`}
                    >
                      {copiedHex === hex ? "복사됨" : hex}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* 4. High-Contrast 16px Editorial Analysis Body */}
            <section className="space-y-5 border-t border-white/[0.08] pt-6">
              <div>
                <h3 className="mb-1.5 text-[13px] font-semibold text-[#E5A93B]">
                  초반 3초 시선 훅
                </h3>
                <p className="text-[16px] font-normal leading-[1.72] text-[#F2EFE9]">
                  {item.breakdown.hook3s}
                </p>
              </div>

              <div>
                <h3 className="mb-1.5 text-[13px] font-semibold text-[#E5A93B]">
                  구도 및 미장센
                </h3>
                <p className="text-[16px] font-normal leading-[1.72] text-[#F2EFE9]">
                  {item.breakdown.framing}
                </p>
              </div>

              <div>
                <h3 className="mb-1.5 text-[13px] font-semibold text-[#E5A93B]">
                  마케팅 실무 인사이트
                </h3>
                <p className="text-[16px] font-normal leading-[1.72] text-[#F2EFE9]">
                  {item.breakdown.marketingApply}
                </p>
              </div>
            </section>

            {/* 5. Clean Tag Pills & Visual 4-Cut Related Strip */}
            <section className="space-y-5 border-t border-white/[0.08] pt-5">
              <div className="flex flex-wrap gap-2">
                {item.compositionTags.map((tag) => (
                  <button
                    key={`m-c-${tag}`}
                    type="button"
                    onClick={() => onSelectCompositionTag?.(tag)}
                    className="rounded-full border border-white/[0.08] bg-[#181A22] px-3 py-1.5 text-[13px] font-medium text-[#E6E2D8] transition-colors hover:bg-[#222530] hover:text-white"
                  >
                    {tag}
                  </button>
                ))}
                {item.persuasionTags.map((tag) => (
                  <button
                    key={`m-p-${tag}`}
                    type="button"
                    onClick={() => onSelectPersuasionTag?.(tag)}
                    className="rounded-full border border-white/[0.08] bg-[#181A22] px-3 py-1.5 text-[13px] font-medium text-[#E6E2D8] transition-colors hover:bg-[#222530] hover:text-[#E5A93B]"
                  >
                    {tag}
                  </button>
                ))}
              </div>

              <div className="space-y-2.5">
                <p className="text-[13px] font-medium text-[#C8C3B8]">
                  유사 구도 레퍼런스
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {relatedItems.map((rel) => (
                    <button
                      key={rel.id}
                      type="button"
                      onClick={() => onSelectItem(rel)}
                      title={`${rel.titleKo} (${rel.year})`}
                      aria-label={`${rel.titleKo} 열기`}
                      className="group aspect-[4/3] overflow-hidden rounded-md bg-black ring-1 ring-white/[0.09] transition-all hover:ring-[#E5A93B]/70"
                    >
                      <img
                        src={rel.thumbnailUrl}
                        alt={rel.titleKo}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    </button>
                  ))}
                </div>
              </div>
            </section>
          </div>

          {/* Minimal Bottom 1-Line Utility Footer */}
          <footer className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] pt-4 text-[13px] text-[#C4BFB4]">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => onToggleCompare(item.id)}
                disabled={!isInCompare && compareFull}
                className={`font-medium transition-colors ${
                  isInCompare
                    ? "text-[#E5A93B]"
                    : compareFull
                    ? "cursor-not-allowed opacity-40"
                    : "hover:text-[#FAF8F5]"
                }`}
              >
                {isInCompare ? "비교 슬롯 해제" : "좌우 비교에 추가"}
              </button>

              <button
                type="button"
                onClick={handleCopyFrameImage}
                disabled={busyAction !== null}
                className="font-medium transition-colors hover:text-[#FAF8F5] disabled:opacity-40"
              >
                {busyAction === "copy" ? "복사 중..." : "이미지 복사"}
              </button>
            </div>

            <a
              href={item.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium transition-colors hover:text-[#FAF8F5]"
            >
              <span>원본 아카이브 출처</span>
              <ExternalLinkIcon className="h-3.5 w-3.5" />
            </a>
          </footer>
        </aside>
      </div>
    </div>
  );
}
