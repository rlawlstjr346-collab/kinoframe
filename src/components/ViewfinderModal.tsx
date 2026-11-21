"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type {
  ArchiveItem,
  AspectRatio,
  VaultBookmark,
  VaultFolder,
} from "@/types/archive";
import {
  findRelatedArchiveItems,
  formatDuration,
  formatPreciseTimestamp,
  getAspectRatioClass,
  getCategoryLabel,
  getCountryLabel,
  resolveItemCategory,
  resolveItemCountry,
} from "@/lib/taxonomy";
import { buildMediaProxyUrl } from "@/lib/media-allowlist";
import {
  captureRawFramePngBlob,
  copyPngBlobToClipboard,
  downloadBlobAsPng,
} from "@/lib/frame-capture";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  ExternalLinkIcon,
  PlayIcon,
} from "@/components/Icons";

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
  onToggleBoard: (id: string, folderId?: string) => void;
  onToggleCompare: (id: string) => void;
  onSaveToVault: (payload: {
    itemId: string;
    folderId: string;
    timestampSec: number | null;
    memo: string;
  }) => void;
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

export function ViewfinderModal({
  item,
  allItems,
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
  onSelectItem,
  onToggleBoard,
  onToggleCompare,
  onSaveToVault,
}: ViewfinderModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [youtubeActive, setYoutubeActive] = useState<boolean>(false);
  const [useDirectVideoFallback, setUseDirectVideoFallback] =
    useState<boolean>(false);
  const [currentTimeSec, setCurrentTimeSec] = useState<number>(0);
  const [selectedFolderId, setSelectedFolderId] = useState<string>(
    existingBookmark?.folderId || folders[0]?.id || "jp-vintage-cf"
  );
  const [copiedHex, setCopiedHex] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<"raw" | "copy" | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const relatedItems = useMemo(
    () => findRelatedArchiveItems(item, allItems, 8),
    [item, allItems]
  );

  useEffect(() => {
    setYoutubeActive(false);
    setUseDirectVideoFallback(false);
    setCurrentTimeSec(0);
    setCopiedHex(null);
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
    window.setTimeout(() => setToastMsg(null), 2600);
  };

  const handleCopyHex = async (hex: string) => {
    try {
      await navigator.clipboard.writeText(hex);
    } catch {
      // ignore clipboard restrictions
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
      flashToast("원본 PNG 다운로드 완료");
    } catch {
      flashToast("다운로드에 실패했습니다. 잠시 후 다시 시도해주세요.");
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
        flashToast("이미지 복사됨");
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

  const handleFolderChange = (nextFolderId: string) => {
    setSelectedFolderId(nextFolderId);
    if (isAuthenticated && isInBoard) {
      const ts = item.mediaSource === "archive_mp4" ? currentTimeSec : null;
      onSaveToVault({
        itemId: item.id,
        folderId: nextFolderId,
        timestampSec: ts,
        memo: existingBookmark?.memo || "",
      });
      const fName = folders.find((f) => f.id === nextFolderId)?.name;
      if (fName) flashToast(`'${fName}' 보드로 이동됨`);
    }
  };

  const videoSrc =
    item.mediaSource === "archive_mp4" && item.previewVideoUrl
      ? useDirectVideoFallback
        ? item.previewVideoUrl
        : buildMediaProxyUrl(item.previewVideoUrl)
      : null;

  const numericRatio = getNumericAspectRatio(item.aspectRatio);
  const categoryLabel = getCategoryLabel(resolveItemCategory(item));
  const countryLabel = getCountryLabel(resolveItemCountry(item));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#050507]/94 backdrop-blur-xl"
      role="dialog"
      aria-modal="true"
      aria-label={`${item.titleKo} 상세 뷰`}
      onClick={onClose}
    >
      <div
        className="flex h-[94vh] w-[96vw] max-w-[2280px] flex-col overflow-hidden rounded-xl border border-white/[0.1] bg-[#0B0C0F] shadow-2xl lg:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        {/* LEFT: Clean Full-Scale Cinema Stage (Zero Viewfinder Overlays) */}
        <div className="relative flex h-[44vh] min-w-0 flex-1 items-center justify-center overflow-hidden bg-[#060608] p-4 [--stage-h:38vh] sm:p-8 lg:h-full lg:p-10 lg:[--stage-h:82vh]">
          {/* Minimal Prev / Next Navigation Glass Pills */}
          <div className="absolute right-4 top-4 z-30 flex items-center gap-2 sm:right-6 sm:top-6">
            <button
              type="button"
              onClick={onPrev}
              disabled={!hasPrev}
              aria-label="이전 작품"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.14] bg-[#0B0C0F]/80 text-[#FAF8F5] backdrop-blur-md transition-colors hover:border-white/35 hover:bg-[#14161D] disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={!hasNext}
              aria-label="다음 작품"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.14] bg-[#0B0C0F]/80 text-[#FAF8F5] backdrop-blur-md transition-colors hover:border-white/35 hover:bg-[#14161D] disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronRightIcon className="h-5 w-5" />
            </button>
          </div>

          {/* Explicit Aspect-Ratio Full-Scale Media Frame */}
          <div
            className={`relative max-h-full overflow-hidden rounded-[6px] bg-black shadow-[0_24px_80px_rgba(0,0,0,0.88)] ${getAspectRatioClass(
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
                    className="absolute inset-0 flex items-center justify-center bg-[#09090B]/20 transition-colors hover:bg-[#09090B]/10"
                    aria-label="영상 재생"
                  >
                    <span className="inline-flex items-center gap-2.5 rounded-full border border-[#F4F1EA]/45 bg-[#09090B]/88 px-6 py-3 text-[16px] font-semibold text-[#FAF8F5] shadow-xl backdrop-blur-md">
                      <PlayIcon className="h-5 w-5 text-[#E5A93B]" />
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
          </div>
        </div>

        {/* RIGHT: Pinterest / Cosmos Pure Visual Archive Sheet (Zero Subjective Commentary) */}
        <aside className="flex h-full w-full shrink-0 flex-col justify-between overflow-y-auto border-t border-white/[0.08] bg-[#0E0F13] px-7 py-7 lg:w-[480px] lg:border-l lg:border-t-0 xl:w-[540px] 2xl:w-[600px] 2xl:px-9 2xl:py-8">
          <div className="space-y-7">
            {/* 1. Large Pinterest h-12 Action Bar */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                {/* Non-Login Instant Copy & Download */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyFrameImage}
                    disabled={busyAction !== null}
                    className="inline-flex h-12 items-center rounded-full border border-white/15 bg-[#1B1D25] px-5 text-[15px] font-semibold text-[#FAF8F5] transition-colors hover:bg-[#262934] disabled:opacity-50 2xl:text-[17px]"
                  >
                    {busyAction === "copy" ? "복사 중..." : "이미지 복사"}
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadRawPng}
                    disabled={busyAction !== null}
                    className="inline-flex h-12 items-center rounded-full border border-white/15 bg-[#1B1D25] px-5 text-[15px] font-semibold text-[#FAF8F5] transition-colors hover:bg-[#262934] disabled:opacity-50 2xl:text-[17px]"
                  >
                    {busyAction === "raw" ? "저장 중..." : "다운로드"}
                  </button>
                </div>

                {/* Account Board Save + Close */}
                <div className="flex items-center gap-2">
                  {isAuthenticated && folders.length > 0 && (
                    <select
                      aria-label="저장할 보드 선택"
                      value={selectedFolderId}
                      onChange={(e) => handleFolderChange(e.target.value)}
                      className="h-12 max-w-[140px] truncate rounded-full border border-white/15 bg-[#14161D] px-3.5 text-[14px] font-medium text-[#FAF8F5] focus:border-[#E5A93B] focus:outline-none 2xl:max-w-[165px] 2xl:text-[15px]"
                    >
                      {folders.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  )}

                  <button
                    type="button"
                    onClick={() => onToggleBoard(item.id, selectedFolderId)}
                    className={`inline-flex h-12 items-center rounded-full px-6 text-[16px] font-bold transition-colors 2xl:text-[17px] ${
                      isInBoard
                        ? "bg-[#D99B26] text-[#09090B] hover:bg-[#e5aa38]"
                        : "bg-[#FAF8F5] text-[#09090B] hover:bg-white"
                    }`}
                  >
                    {isInBoard ? "저장됨" : "저장"}
                  </button>

                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="닫기"
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[#D8D4CA] transition-colors hover:bg-white/[0.1] hover:text-white"
                  >
                    <CloseIcon className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {toastMsg && (
                <div
                  role="status"
                  className="rounded-lg bg-[#E5A93B]/18 px-4 py-2.5 text-[15px] font-semibold text-[#FAF8F5] ring-1 ring-[#E5A93B]/45"
                >
                  {toastMsg}
                </div>
              )}
            </div>

            {/* 2. Objective Archive Specifications (Zero Subjective Prose) */}
            <div>
              <p className="text-[15px] font-semibold tracking-wide text-[#E5A93B] 2xl:text-[17px]">
                {categoryLabel} · {countryLabel} · {item.year}
                {item.mediaSource === "archive_mp4" && (
                  <span className="ml-2 font-mono text-[#D8D4CA]">
                    {formatPreciseTimestamp(currentTimeSec)}
                  </span>
                )}
              </p>

              <h2 className="mt-2 text-[26px] font-bold leading-[1.28] tracking-[-0.02em] text-[#FFFFFF] xl:text-[29px] 2xl:text-[32px]">
                {item.titleKo}
              </h2>

              <p className="mt-1.5 text-[16px] leading-snug text-[#D8D4CA] 2xl:text-[18px]">
                {item.originalTitle}
              </p>

              <dl className="mt-5 grid grid-cols-2 gap-4 border-y border-white/10 py-4 text-[15px] 2xl:text-[16px]">
                <div>
                  <dt className="text-[13px] font-medium text-[#B8B3A8]">
                    출처 · 브랜드
                  </dt>
                  <dd className="mt-1 font-medium text-[#FAF8F5]">
                    {item.brandOrSource}
                  </dd>
                </div>

                <div>
                  <dt className="text-[13px] font-medium text-[#B8B3A8]">
                    화면비 · 러닝타임
                  </dt>
                  <dd className="mt-1 font-mono font-medium text-[#FAF8F5]">
                    {item.aspectRatio} · {formatDuration(item.durationSec)}
                  </dd>
                </div>

                <div>
                  <dt className="text-[13px] font-medium text-[#B8B3A8]">
                    아카이브 라이선스
                  </dt>
                  <dd className="mt-1 text-[#E6E2D8]">{item.licenseNote}</dd>
                </div>

                <div>
                  <dt className="text-[13px] font-medium text-[#B8B3A8]">
                    원본 링크
                  </dt>
                  <dd className="mt-1">
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 font-semibold text-[#E5A93B] hover:underline"
                    >
                      <span>원본 아카이브 열기</span>
                      <ExternalLinkIcon className="h-4 w-4" />
                    </a>
                  </dd>
                </div>
              </dl>
            </div>

            {/* 3. Wide 56px Color Palette Swatch Bar */}
            <div>
              <div className="flex h-14 w-full overflow-hidden rounded-xl ring-1 ring-white/12">
                {item.palette.map((hex, idx) => (
                  <button
                    key={`${item.id}-sw-${idx}`}
                    type="button"
                    onClick={() => handleCopyHex(hex)}
                    title={`${hex} 복사`}
                    aria-label={`컬러 ${hex} 복사`}
                    className="group/swatch relative flex flex-1 items-center justify-center transition-all duration-200 hover:flex-[1.5] focus-visible:flex-[1.5]"
                    style={{ backgroundColor: hex }}
                  >
                    <span
                      className={`rounded-md bg-[#09090B]/82 px-2.5 py-1 font-mono text-[15px] font-bold text-[#FFFFFF] backdrop-blur-sm transition-opacity ${
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

            {/* 4. Pinterest-Style 8-Item Related Archive Visual Grid */}
            <section className="space-y-3.5">
              <h3 className="text-[16px] font-bold text-[#FAF8F5] 2xl:text-[18px]">
                비슷한 아카이브
              </h3>
              <div className="grid grid-cols-2 gap-3.5">
                {relatedItems.map((rel) => {
                  const relCat = getCategoryLabel(resolveItemCategory(rel));
                  const relCountry = getCountryLabel(resolveItemCountry(rel));
                  return (
                    <button
                      key={rel.id}
                      type="button"
                      onClick={() => onSelectItem(rel)}
                      className="group overflow-hidden rounded-lg bg-[#15171E] text-left ring-1 ring-white/[0.08] transition-all hover:ring-[#FAF8F5]/45"
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
                        <p className="truncate text-[14px] font-semibold text-[#FAF8F5]">
                          {rel.titleKo}
                        </p>
                        <p className="mt-0.5 truncate text-[12px] text-[#C8C3B8]">
                          {relCountry} · {rel.year} · {relCat}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>

          {/* Subtle Bottom Compare Utility */}
          <footer className="mt-7 flex items-center justify-between border-t border-white/[0.08] pt-4 text-[14px] text-[#D0CBC0]">
            <button
              type="button"
              onClick={() => onToggleCompare(item.id)}
              disabled={!isInCompare && compareFull}
              className={`font-medium transition-colors ${
                isInCompare
                  ? "text-[#E5A93B]"
                  : compareFull
                  ? "cursor-not-allowed opacity-40"
                  : "hover:text-white"
              }`}
            >
              {isInCompare ? "비교 슬롯 해제" : "좌우 비교에 추가"}
            </button>
            <span className="font-mono text-[13px] text-[#B8B3A8]">
              {item.id}
            </span>
          </footer>
        </aside>
      </div>
    </div>
  );
}
