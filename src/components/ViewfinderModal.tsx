"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ArchiveItem,
  CompositionTag,
  OverlayVisibility,
  PersuasionTag,
  VaultBookmark,
  VaultFolder,
} from "@/types/archive";
import {
  findRelatedArchiveItems,
  formatDuration,
  formatPreciseTimestamp,
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
  BoardBookmarkIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  CompareIcon,
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

type InspectorTab = "analysis" | "download" | "vault";

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

const OPTIMAL_OVERLAY_OPACITY = 0.78;

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
  onCreateFolder,
  onSelectCompositionTag,
  onSelectPersuasionTag,
}: ViewfinderModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Composition overlay strictly OFF by default
  const [overlay, setOverlay] = useState<OverlayVisibility>(OFF_OVERLAY);
  const [activeTab, setActiveTab] = useState<InspectorTab>("analysis");
  const [youtubeActive, setYoutubeActive] = useState<boolean>(false);
  const [useDirectVideoFallback, setUseDirectVideoFallback] =
    useState<boolean>(false);
  const [currentTimeSec, setCurrentTimeSec] = useState<number>(0);
  const [copiedHex, setCopiedHex] = useState<string | null>(null);

  // PC Download states
  const [busyAction, setBusyAction] = useState<"raw" | "card" | "copy" | null>(
    null
  );
  const [captureNotice, setCaptureNotice] = useState<string | null>(null);

  // Vault tab states
  const [selectedFolderId, setSelectedFolderId] = useState<string>(
    existingBookmark?.folderId || folders[0]?.id || "hook-3s"
  );
  const [newFolderName, setNewFolderName] = useState<string>("");
  const [memoText, setMemoText] = useState<string>(existingBookmark?.memo || "");
  const [vaultSavedNotice, setVaultSavedNotice] = useState<boolean>(false);

  const isGridActive =
    overlay.perspective ||
    overlay.thirds ||
    overlay.symmetry ||
    overlay.eyePath;

  const relatedItems = useMemo(
    () => findRelatedArchiveItems(item, allItems, 4),
    [item, allItems]
  );

  // Reset per-item states when switching frames
  useEffect(() => {
    setOverlay(OFF_OVERLAY);
    setYoutubeActive(false);
    setUseDirectVideoFallback(false);
    setCurrentTimeSec(0);
    setCopiedHex(null);
    setCaptureNotice(null);
    setVaultSavedNotice(false);
    setSelectedFolderId(
      existingBookmark?.folderId || folders[0]?.id || "hook-3s"
    );
    setMemoText(existingBookmark?.memo || "");
  }, [item, existingBookmark, folders]);

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

  const handleCopyHex = async (hex: string) => {
    try {
      await navigator.clipboard.writeText(hex);
    } catch {
      // ignore clipboard permission errors
    }
    setCopiedHex(hex);
    window.setTimeout(() => setCopiedHex(null), 1600);
  };

  const flashNotice = (msg: string) => {
    setCaptureNotice(msg);
    window.setTimeout(() => setCaptureNotice(null), 3200);
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
      flashNotice("현재 장면 원본 PNG가 컴퓨터에 저장되었습니다.");
    } catch {
      flashNotice("프레임 캡처에 실패했습니다. 잠시 후 다시 시도해주세요.");
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
      flashNotice("컬러칩·분석 레퍼런스 카드 PNG가 저장되었습니다.");
    } catch {
      flashNotice("레퍼런스 카드 생성에 실패했습니다. 다시 시도해주세요.");
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
        flashNotice("클립보드에 PNG 이미지가 복사되었습니다.");
      } else {
        downloadBlobAsPng(blob, `${item.id}_frame${timestampSuffix}.png`);
        flashNotice(
          "브라우저가 이미지 클립보드 복사를 제한해 PNG 파일로 자동 저장했습니다."
        );
      }
    } catch {
      flashNotice("이미지 복사에 실패했습니다.");
    } finally {
      setBusyAction(null);
    }
  };

  const handleCreateAndSelectFolder = () => {
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    const createdId = onCreateFolder(trimmed);
    setSelectedFolderId(createdId);
    setNewFolderName("");
  };

  const handleSaveVaultEntry = () => {
    const ts = item.mediaSource === "archive_mp4" ? currentTimeSec : null;
    onSaveToVault({
      itemId: item.id,
      folderId: selectedFolderId,
      timestampSec: ts,
      memo: memoText.trim(),
    });
    setVaultSavedNotice(true);
    window.setTimeout(() => setVaultSavedNotice(false), 2200);
  };

  const videoSrc =
    item.mediaSource === "archive_mp4" && item.previewVideoUrl
      ? useDirectVideoFallback
        ? item.previewVideoUrl
        : buildMediaProxyUrl(item.previewVideoUrl)
      : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#09090B]/94 p-2 backdrop-blur-md sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${item.titleKo} 라이트박스`}
      onClick={onClose}
    >
      <div
        className="flex max-h-[94vh] w-[96vw] max-w-[1720px] flex-col overflow-hidden rounded-[6px] border border-[#F4F1EA]/[0.12] bg-[#0D0E12] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Lightbox Utility Bar (Enlarged HIG Click Targets) */}
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F4F1EA]/[0.08] bg-[#09090B] px-5 py-3">
          {/* Left: Single Master Grid Toggle + Quiet Mini Layer Chips when ON */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleToggleMasterGrid}
              aria-pressed={isGridActive}
              className={`inline-flex items-center gap-2 rounded-[4px] border px-3.5 py-2 font-mono text-sm font-medium transition-colors ${
                isGridActive
                  ? "border-[#D99B26] bg-[#D99B26]/18 text-[#D99B26]"
                  : "border-[#F4F1EA]/[0.14] bg-[#111216] text-ivory hover:border-[#D99B26]/60 hover:text-[#D99B26]"
              }`}
            >
              <ViewfinderIcon className="h-4 w-4" />
              <span>
                {isGridActive ? "구도 그리드 끄기 (G)" : "구도 그리드 보기 (G)"}
              </span>
            </button>

            {isGridActive && (
              <div
                className="flex items-center gap-1.5"
                role="group"
                aria-label="구도 레이어 세부 전환"
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
                    className={`rounded-[4px] px-2.5 py-1 font-mono text-xs transition-colors ${
                      overlay[key]
                        ? "bg-[#D99B26]/22 font-semibold text-[#D99B26]"
                        : "text-silver/70 hover:bg-[#F4F1EA]/[0.07] hover:text-ivory"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right: Telemetry + Prev / Next / Close */}
          <div className="flex items-center gap-2">
            <span className="mr-2 hidden font-mono text-xs text-silver/80 md:inline">
              {item.id} · {item.aspectRatio} · {formatDuration(item.durationSec)}
            </span>
            <button
              type="button"
              onClick={onPrev}
              disabled={!hasPrev}
              aria-label="이전 작품"
              className="inline-flex items-center gap-1 rounded-[4px] border border-[#F4F1EA]/[0.12] bg-[#111216] px-3.5 py-2 text-sm text-silver transition-colors hover:border-[#F4F1EA]/30 hover:text-ivory disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronLeftIcon className="h-4 w-4" />
              <span className="hidden sm:inline">이전</span>
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={!hasNext}
              aria-label="다음 작품"
              className="inline-flex items-center gap-1 rounded-[4px] border border-[#F4F1EA]/[0.12] bg-[#111216] px-3.5 py-2 text-sm text-silver transition-colors hover:border-[#F4F1EA]/30 hover:text-ivory disabled:cursor-not-allowed disabled:opacity-30"
            >
              <span className="hidden sm:inline">다음</span>
              <ChevronRightIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="라이트박스 닫기"
              className="inline-flex items-center gap-1 rounded-[4px] border border-[#F4F1EA]/[0.12] bg-[#111216] px-3.5 py-2 text-sm text-silver transition-colors hover:border-[#D99B26]/60 hover:text-ivory"
            >
              <CloseIcon className="h-4 w-4" />
              <span className="hidden sm:inline">닫기</span>
            </button>
          </div>
        </header>

        {/* Main Lightbox Split: Large Cinema Viewer (8 cols) + Readable 3-Tab Inspector (4 cols) */}
        <div className="grid flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-12">
          {/* Left Cinema Stage */}
          <div className="relative flex min-h-[340px] flex-col items-center justify-center bg-[#050507] p-4 lg:col-span-8 lg:min-h-[640px] lg:border-r lg:border-[#F4F1EA]/[0.08] lg:p-8">
            <div className="relative flex w-full items-center justify-center overflow-hidden">
              {item.mediaSource === "archive_mp4" && videoSrc ? (
                <div className="relative inline-flex max-w-full items-center justify-center">
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
                    className="max-h-[80vh] w-auto max-w-full bg-black object-contain"
                  />
                  <ViewfinderOverlay
                    viewfinder={item.viewfinder}
                    visibility={overlay}
                    opacity={OPTIMAL_OVERLAY_OPACITY}
                  />
                </div>
              ) : item.mediaSource === "youtube_embed" && item.youtubeId ? (
                youtubeActive ? (
                  <div className="relative aspect-video w-full max-w-5xl">
                    <iframe
                      src={`https://www.youtube-nocookie.com/embed/${item.youtubeId}?autoplay=1&rel=0`}
                      title={item.titleKo}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="h-full w-full border-0"
                    />
                  </div>
                ) : (
                  <div className="relative aspect-video w-full max-w-5xl overflow-hidden bg-black">
                    <img
                      src={item.thumbnailUrl}
                      alt={item.titleKo}
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setYoutubeActive(true)}
                      className="absolute inset-0 flex items-center justify-center bg-[#09090B]/25 transition-colors hover:bg-[#09090B]/10"
                      aria-label="YouTube 아카이브 영상 재생"
                    >
                      <span className="inline-flex items-center gap-2 rounded-full border border-[#D99B26]/80 bg-[#09090B]/88 px-5 py-2.5 font-mono text-sm font-semibold text-[#D99B26] shadow-lg backdrop-blur-sm">
                        <PlayIcon className="h-4 w-4" />
                        YOUTUBE PLAY
                      </span>
                    </button>
                    <ViewfinderOverlay
                      viewfinder={item.viewfinder}
                      visibility={overlay}
                      opacity={OPTIMAL_OVERLAY_OPACITY}
                    />
                  </div>
                )
              ) : (
                <div className="relative inline-flex max-w-full items-center justify-center">
                  <img
                    src={item.thumbnailUrl}
                    alt={item.titleKo}
                    className="max-h-[80vh] w-auto max-w-full object-contain"
                  />
                  <ViewfinderOverlay
                    viewfinder={item.viewfinder}
                    visibility={overlay}
                    opacity={OPTIMAL_OVERLAY_OPACITY}
                  />
                </div>
              )}
            </div>

            {item.mediaSource === "youtube_embed" && youtubeActive && (
              <button
                type="button"
                onClick={() => setYoutubeActive(false)}
                className="mt-3 font-mono text-xs text-[#D99B26] underline underline-offset-4 hover:text-ivory"
              >
                스틸 프레임으로 돌아가 구도 그리드 보기
              </button>
            )}
          </div>

          {/* Right Editorial 3-Tab Inspector */}
          <aside className="flex flex-col bg-[#0D0E12] lg:col-span-4">
            {/* Fixed Editorial Header */}
            <div className="border-b border-[#F4F1EA]/[0.08] px-6 py-5">
              <p className="font-mono text-xs uppercase tracking-wider text-[#D99B26]">
                {item.mediaType} · {item.year} · {item.brandOrSource}
              </p>
              <h2 className="mt-2 text-xl font-semibold leading-snug tracking-tight text-[#F4F1EA] sm:text-2xl">
                {item.titleKo}
              </h2>
              <p className="mt-1.5 text-sm text-[#BEB9AE]">
                {item.originalTitle}
              </p>
            </div>

            {/* Crisp 3-Tab Navigation Bar */}
            <div
              className="grid grid-cols-3 border-b border-[#F4F1EA]/[0.08] bg-[#09090B]"
              role="tablist"
              aria-label="상세 정보 탭"
            >
              {(
                [
                  ["analysis", "색감 · 분석"],
                  ["download", "컴퓨터 저장"],
                  ["vault", "보관함 · 연관"],
                ] as Array<[InspectorTab, string]>
              ).map(([tabKey, label]) => {
                const active = activeTab === tabKey;
                return (
                  <button
                    key={tabKey}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveTab(tabKey)}
                    className={`border-b-2 py-3 text-center text-sm font-medium transition-colors ${
                      active
                        ? "border-[#D99B26] bg-[#111216] text-[#F4F1EA]"
                        : "border-transparent text-[#BEB9AE] hover:text-[#F4F1EA]"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Tab Panel Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {/* TAB 1: 색감 · 분석 */}
              {activeTab === "analysis" && (
                <div className="space-y-6">
                  {/* Wide h-12 5-Color Palette Strip */}
                  <section className="border-b border-[#F4F1EA]/[0.08] pb-5">
                    <div className="mb-2.5 flex items-center justify-between">
                      <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-[#BEB9AE]">
                        COLOR PALETTE
                      </h3>
                      <span className="font-mono text-xs text-[#BEB9AE]">
                        {copiedHex ? (
                          <span className="inline-flex items-center gap-1 text-[#D99B26]">
                            <CheckIcon className="h-3.5 w-3.5" />
                            {copiedHex} 복사됨
                          </span>
                        ) : (
                          "클릭하여 HEX 복사"
                        )}
                      </span>
                    </div>

                    <div className="flex h-12 w-full overflow-hidden rounded-[4px] ring-1 ring-[#F4F1EA]/15">
                      {item.palette.map((hex, idx) => (
                        <button
                          key={`${item.id}-swatch-${idx}`}
                          type="button"
                          onClick={() => handleCopyHex(hex)}
                          title={`${hex} 복사`}
                          aria-label={`컬러 ${hex} 복사`}
                          className="group/swatch relative flex-1 transition-all duration-200 hover:flex-[1.5] focus-visible:flex-[1.5]"
                          style={{ backgroundColor: hex }}
                        >
                          <span className="absolute inset-x-0 bottom-0 bg-[#09090B]/80 py-0.5 text-center font-mono text-[11px] text-ivory opacity-0 transition-opacity group-hover/swatch:opacity-100">
                            {hex}
                          </span>
                        </button>
                      ))}
                    </div>

                    <div className="mt-2 grid grid-cols-5 gap-1">
                      {item.palette.map((hex, idx) => (
                        <button
                          key={`${item.id}-code-${idx}`}
                          type="button"
                          onClick={() => handleCopyHex(hex)}
                          className={`text-center font-mono text-xs transition-colors ${
                            copiedHex === hex
                              ? "font-semibold text-[#D99B26]"
                              : "text-[#BEB9AE] hover:text-[#F4F1EA]"
                          }`}
                        >
                          {hex}
                        </button>
                      ))}
                    </div>
                  </section>

                  {/* Readable Editorial Analysis */}
                  <section className="space-y-4 divide-y divide-[#F4F1EA]/[0.08]">
                    <div>
                      <p className="font-mono text-xs font-semibold tracking-wider text-[#D99B26]">
                        초반 3초 시선 훅
                      </p>
                      <p className="mt-1.5 text-[15px] leading-relaxed text-[#ECE8DF]">
                        {item.breakdown.hook3s}
                      </p>
                    </div>

                    <div className="pt-4">
                      <p className="font-mono text-xs font-semibold tracking-wider text-[#D99B26]">
                        구도·조명 설계
                      </p>
                      <p className="mt-1.5 text-[15px] leading-relaxed text-[#ECE8DF]">
                        {item.breakdown.framing}
                      </p>
                    </div>

                    <div className="pt-4">
                      <p className="font-mono text-xs font-semibold tracking-wider text-[#D99B26]">
                        마케팅 실무 적용
                      </p>
                      <p className="mt-1.5 text-[15px] leading-relaxed text-[#ECE8DF]">
                        {item.breakdown.marketingApply}
                      </p>
                    </div>
                  </section>

                  {/* Clickable Filter Tags */}
                  <section className="border-t border-[#F4F1EA]/[0.08] pt-4">
                    <div className="flex flex-wrap gap-2">
                      {item.compositionTags.map((tag) => (
                        <button
                          key={`m-c-${tag}`}
                          type="button"
                          onClick={() => onSelectCompositionTag?.(tag)}
                          title={`'${tag}' 구도 필터 적용`}
                          className="rounded-[4px] border border-[#F4F1EA]/[0.15] bg-[#111216] px-3 py-1.5 text-xs font-medium text-[#F4F1EA] transition-colors hover:border-[#F4F1EA] hover:bg-[#F4F1EA] hover:text-[#09090B]"
                        >
                          {tag}
                        </button>
                      ))}
                      {item.persuasionTags.map((tag) => (
                        <button
                          key={`m-p-${tag}`}
                          type="button"
                          onClick={() => onSelectPersuasionTag?.(tag)}
                          title={`'${tag}' 설득 훅 필터 적용`}
                          className="rounded-[4px] border border-[#D99B26]/40 bg-[#D99B26]/12 px-3 py-1.5 text-xs font-medium text-[#D99B26] transition-colors hover:border-[#D99B26] hover:bg-[#D99B26] hover:text-[#09090B]"
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </section>
                </div>
              )}

              {/* TAB 2: 컴퓨터 저장 (Non-Login Instant PC PNG Export) */}
              {activeTab === "download" && (
                <div className="space-y-5">
                  <div className="rounded-[4px] border border-[#F4F1EA]/[0.1] bg-[#111216] p-4">
                    <p className="font-mono text-xs font-semibold uppercase tracking-wider text-[#D99B26]">
                      로그인 없이 즉시 PC 저장
                    </p>
                    <p className="mt-1.5 text-sm leading-relaxed text-[#ECE8DF]">
                      {item.mediaSource === "archive_mp4" ? (
                        <>
                          현재 영상 프레임{" "}
                          <strong className="rounded bg-[#D99B26]/20 px-2 py-0.5 font-mono text-[#D99B26]">
                            현재 프레임 {formatPreciseTimestamp(currentTimeSec)}
                          </strong>{" "}
                          시점을 원하는 순간에 일시정지한 뒤 고해상도 PNG로 저장할 수 있습니다.
                        </>
                      ) : (
                        "보안 미디어 프록시를 통해 CORS 제한 없이 고해상도 스틸컷과 컬러 레퍼런스 카드를 즉시 저장합니다."
                      )}
                    </p>
                  </div>

                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={handleDownloadRawPng}
                      disabled={busyAction !== null}
                      className="flex w-full items-center justify-between rounded-[4px] bg-[#D99B26] px-4 py-3.5 text-left text-sm font-semibold text-[#09090B] transition-opacity hover:opacity-92 disabled:opacity-50"
                    >
                      <span>
                        {busyAction === "raw"
                          ? "원본 프레임 추출 중..."
                          : "현재 장면 원본 PNG 컴퓨터 저장"}
                      </span>
                      <span className="font-mono text-xs opacity-80">PNG</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleDownloadReferenceCardPng}
                      disabled={busyAction !== null}
                      className="flex w-full items-center justify-between rounded-[4px] border border-[#D99B26]/55 bg-[#D99B26]/14 px-4 py-3.5 text-left text-sm font-semibold text-[#F4F1EA] transition-colors hover:bg-[#D99B26]/24 disabled:opacity-50"
                    >
                      <span>
                        {busyAction === "card"
                          ? "레퍼런스 카드 합성 중..."
                          : "컬러칩 · 분석 레퍼런스 카드 PNG 저장"}
                      </span>
                      <span className="font-mono text-xs text-[#D99B26]">
                        1600px SHEET
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={handleCopyFrameImage}
                      disabled={busyAction !== null}
                      className="flex w-full items-center justify-between rounded-[4px] border border-[#F4F1EA]/[0.16] bg-[#111216] px-4 py-3.5 text-left text-sm font-medium text-[#F4F1EA] transition-colors hover:border-[#F4F1EA]/40 disabled:opacity-50"
                    >
                      <span>
                        {busyAction === "copy"
                          ? "클립보드 복사 중..."
                          : "클립보드에 이미지 복사"}
                      </span>
                      <span className="font-mono text-xs text-[#BEB9AE]">
                        COPY PNG
                      </span>
                    </button>

                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex w-full items-center justify-between rounded-[4px] border border-[#F4F1EA]/[0.12] bg-[#09090B] px-4 py-3 text-sm font-medium text-[#BEB9AE] transition-colors hover:border-[#F4F1EA]/30 hover:text-[#F4F1EA]"
                    >
                      <span>원본 아카이브 출처 열기</span>
                      <ExternalLinkIcon className="h-4 w-4" />
                    </a>
                  </div>

                  {captureNotice && (
                    <div
                      role="status"
                      className="rounded-[4px] border border-[#D99B26]/50 bg-[#D99B26]/12 px-4 py-3 text-sm text-[#F4F1EA]"
                    >
                      {captureNotice}
                    </div>
                  )}

                  <p className="font-mono text-xs text-[#BEB9AE]/70">
                    라이선스: {item.licenseNote}
                  </p>
                </div>
              )}

              {/* TAB 3: 보관함 · 연관 */}
              {activeTab === "vault" && (
                <div className="space-y-6">
                  {/* Folder Bookmark & Memo Editor */}
                  <section className="space-y-3 border-b border-[#F4F1EA]/[0.08] pb-5">
                    <div className="flex items-center justify-between">
                      <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-[#D99B26]">
                        폴더 북마크 · 장면 메모 저장
                      </h3>
                      {item.mediaSource === "archive_mp4" && (
                        <span className="rounded bg-[#D99B26]/15 px-2 py-0.5 font-mono text-xs text-[#D99B26]">
                          타임스탬프 {formatPreciseTimestamp(currentTimeSec)}
                        </span>
                      )}
                    </div>

                    <div className="space-y-2">
                      <label className="block text-xs font-medium text-[#BEB9AE]">
                        저장 폴더 선택
                      </label>
                      <select
                        value={selectedFolderId}
                        onChange={(e) => setSelectedFolderId(e.target.value)}
                        className="w-full rounded-[4px] border border-[#F4F1EA]/[0.14] bg-[#111216] px-3 py-2.5 text-sm text-[#F4F1EA] focus:border-[#D99B26] focus:outline-none"
                      >
                        {folders.map((folder) => (
                          <option key={folder.id} value={folder.id}>
                            {folder.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Quick Create Folder */}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleCreateAndSelectFolder();
                          }
                        }}
                        placeholder="새 폴더 이름 (예: 여름 캠페인)"
                        className="flex-1 rounded-[4px] border border-[#F4F1EA]/[0.12] bg-[#09090B] px-3 py-2 text-sm text-[#F4F1EA] placeholder:text-[#BEB9AE]/55 focus:border-[#D99B26] focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleCreateAndSelectFolder}
                        className="rounded-[4px] border border-[#F4F1EA]/[0.16] bg-[#111216] px-3 py-2 text-xs font-medium text-[#F4F1EA] hover:border-[#D99B26] hover:text-[#D99B26]"
                      >
                        폴더 추가
                      </button>
                    </div>

                    {/* 1-Line Scene Memo */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-[#BEB9AE]">
                        장면 메모 (1줄)
                      </label>
                      <input
                        type="text"
                        value={memoText}
                        onChange={(e) => setMemoText(e.target.value)}
                        placeholder="예: 오프닝 3초 보색 전환 레퍼런스"
                        className="w-full rounded-[4px] border border-[#F4F1EA]/[0.12] bg-[#09090B] px-3 py-2.5 text-sm text-[#F4F1EA] placeholder:text-[#BEB9AE]/55 focus:border-[#D99B26] focus:outline-none"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleSaveVaultEntry}
                      className="flex w-full items-center justify-center gap-2 rounded-[4px] bg-[#D99B26] px-4 py-2.5 text-sm font-semibold text-[#09090B] transition-opacity hover:opacity-92"
                    >
                      {vaultSavedNotice ? (
                        <>
                          <CheckIcon className="h-4 w-4" />
                          보관함에 저장되었습니다
                        </>
                      ) : (
                        <>
                          <BoardBookmarkIcon className="h-4 w-4" filled />
                          {existingBookmark
                            ? "보관함 메모·폴더 업데이트"
                            : "현재 장면 보관함에 저장"}
                        </>
                      )}
                    </button>
                  </section>

                  {/* Related 4 Archives */}
                  <section className="space-y-3">
                    <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-[#BEB9AE]">
                      연관 아카이브 4선 (유사 구도·설득)
                    </h3>
                    <div className="grid grid-cols-2 gap-2.5">
                      {relatedItems.map((rel) => (
                        <button
                          key={rel.id}
                          type="button"
                          onClick={() => onSelectItem(rel)}
                          className="group overflow-hidden rounded-[4px] border border-[#F4F1EA]/[0.1] bg-[#111216] text-left transition-colors hover:border-[#D99B26]/60"
                        >
                          <div className="aspect-[4/3] w-full overflow-hidden bg-black">
                            <img
                              src={rel.thumbnailUrl}
                              alt={rel.titleKo}
                              loading="lazy"
                              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                            />
                          </div>
                          <div className="p-2.5">
                            <p className="font-mono text-[11px] text-[#D99B26]">
                              {rel.mediaType} · {rel.year}
                            </p>
                            <p className="mt-0.5 truncate text-xs font-medium text-[#F4F1EA]">
                              {rel.titleKo}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </section>
                </div>
              )}
            </div>

            {/* Bottom Single-Row Quick Action Bar */}
            <div className="flex items-center gap-2 border-t border-[#F4F1EA]/[0.08] bg-[#09090B] px-6 py-3.5">
              <button
                type="button"
                onClick={() => onToggleBoard(item.id)}
                className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-[4px] px-3 py-2.5 text-sm font-medium transition-colors ${
                  isInBoard
                    ? "bg-[#D99B26] font-semibold text-[#09090B]"
                    : "border border-[#F4F1EA]/[0.14] bg-[#111216] text-ivory hover:border-[#D99B26]/60"
                }`}
              >
                <BoardBookmarkIcon className="h-4 w-4" filled={isInBoard} />
                <span>{isInBoard ? "보관함 담김" : "보관함 담기"}</span>
              </button>

              <button
                type="button"
                onClick={() => onToggleCompare(item.id)}
                disabled={!isInCompare && compareFull}
                className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-[4px] px-3 py-2.5 text-sm font-medium transition-colors ${
                  isInCompare
                    ? "border border-[#D99B26] bg-[#D99B26]/20 text-[#D99B26]"
                    : compareFull
                    ? "cursor-not-allowed border border-[#F4F1EA]/[0.08] text-silver/40"
                    : "border border-[#F4F1EA]/[0.14] bg-[#111216] text-ivory hover:border-[#D99B26]/60"
                }`}
              >
                <CompareIcon className="h-4 w-4" />
                <span>{isInCompare ? "비교중" : "비교 추가"}</span>
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
