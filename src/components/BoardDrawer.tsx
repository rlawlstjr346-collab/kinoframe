"use client";

import React, { useEffect, useRef, useState } from "react";
import type { ArchiveItem } from "@/types/archive";
import { generateMoodboardMarkdown } from "@/lib/taxonomy";
import { buildBoardShareUrl } from "@/lib/board-store";
import { getCropLayerStyle, getVisibleAspect } from "@/lib/media-crop";
import { BoardBookmarkIcon, CopyIcon, ShareLinkIcon } from "@/components/Icons";

interface BoardDrawerProps {
  open: boolean;
  mode: "mine" | "shared";
  items: ArchiveItem[];
  missingCount: number;
  onClose: () => void;
  onOpenItem: (item: ArchiveItem) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onImportShared: () => void;
  onToast: (msg: string) => void;
}

const EXIT_MS = 200;
const ACTION =
  "inline-flex h-[var(--kf-control-h)] items-center justify-center gap-[0.45em] rounded-full px-[clamp(14px,0.9vw,32px)] text-[length:var(--kf-text-ui)] font-medium tracking-[-0.015em] transition-[background-color,transform] duration-[160ms] ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.97] active:duration-[120ms] disabled:opacity-40";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function BoardDrawer({
  open,
  mode,
  items,
  missingCount,
  onClose,
  onOpenItem,
  onRemove,
  onClear,
  onImportShared,
  onToast,
}: BoardDrawerProps) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      return;
    }
    if (!mounted) return;
    setClosing(true);
    const t = window.setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, EXIT_MS);
    return () => window.clearTimeout(t);
  }, [open, mounted]);

  useEffect(() => {
    if (!open) return;
    closeBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  const ids = items.map((i) => i.id);
  const shareUrl = () => buildBoardShareUrl(ids);
  const title = mode === "shared" ? "공유된 보드" : "내 보드";

  return (
    <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-label={`${title} (${items.length}개)`}>
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/70 transition-opacity duration-200 ${closing ? "opacity-0" : "animate-[kf-fade-in_280ms_cubic-bezier(0.16,1,0.3,1)]"}`}
      />
      <aside
        className={`absolute inset-x-0 bottom-0 flex max-h-[84vh] flex-col rounded-t-[24px] border-t border-white/[0.1] bg-[var(--kf-surface)] shadow-[0_-30px_80px_rgba(0,0,0,0.7)] sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[clamp(360px,27vw,1040px)] sm:rounded-none sm:border-l sm:border-t-0 ${
          closing
            ? "translate-y-full opacity-0 transition-[transform,opacity] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] sm:translate-x-full sm:translate-y-0"
            : "animate-[kf-drawer-up_280ms_cubic-bezier(0.16,1,0.3,1)] sm:animate-[kf-drawer-in_280ms_cubic-bezier(0.16,1,0.3,1)]"
        }`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] px-[clamp(18px,1.2vw,44px)] py-[clamp(14px,0.9vw,32px)]">
          <div className="min-w-0">
            <h2 className="text-[clamp(17px,1.05vw,38px)] font-semibold tracking-[-0.022em] text-[var(--kf-text)]">
              {title} <span className="num text-[var(--kf-text-muted)]">{items.length}</span>
            </h2>
            <p className="mt-0.5 text-[clamp(12.5px,0.75vw,26px)] text-[var(--kf-text-secondary)]">
              {mode === "shared" ? "링크로 받은 레퍼런스입니다. 내 보드로 가져올 수 있습니다." : "로그인 없이 이 브라우저에 저장됩니다."}
            </p>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="보드 닫기"
            className="inline-flex h-[var(--kf-control-h)] w-[var(--kf-control-h)] shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-white transition-colors hover:bg-white/[0.16]"
          >
            <svg viewBox="0 0 24 24" className="h-[45%] w-[45%]" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-[clamp(18px,1.2vw,44px)] py-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <BoardBookmarkIcon className="h-8 w-8 text-[var(--kf-text-muted)]" />
              <p className="text-[length:var(--kf-text-ui)] text-[var(--kf-text-secondary)]">
                타일 오른쪽 위 책갈피나 상세 화면의 ‘보드에 담기’로 컷을 모아 보세요.
              </p>
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-[clamp(8px,0.6vw,22px)]">
              {items.map((item) => (
                <li key={item.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => onOpenItem(item)}
                    className="block w-full text-left"
                    aria-label={`${item.titleKo} 상세 보기`}
                  >
                    {/* Uniform 16:10 cells; the bar-free picture box covers the cell like object-fit: cover */}
                    <span className="relative block aspect-[16/10] w-full overflow-hidden rounded-[12px] bg-[var(--kf-tile-bg)] ring-1 ring-white/[0.08]">
                      <span
                        className="absolute left-1/2 top-1/2 block -translate-x-1/2 -translate-y-1/2 overflow-hidden"
                        style={{
                          aspectRatio: String(getVisibleAspect(item)),
                          ...(getVisibleAspect(item) >= 1.6 ? { height: "100%" } : { width: "100%" }),
                        }}
                      >
                        <span style={getCropLayerStyle(item)} className="block">
                          <img src={item.thumbnailUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                        </span>
                      </span>
                    </span>
                    <span className="mt-1.5 block truncate text-[clamp(13px,0.78vw,27px)] font-medium tracking-[-0.015em] text-[var(--kf-text)]">
                      {item.titleKo}
                    </span>
                    <span className="num block text-[clamp(12px,0.7vw,24px)] text-[var(--kf-text-muted)]">{item.year}</span>
                  </button>
                  {mode === "mine" && (
                    <button
                      type="button"
                      onClick={() => onRemove(item.id)}
                      aria-label={`${item.titleKo} 보드에서 빼기`}
                      className="absolute right-1.5 top-1.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md transition-opacity hover:bg-black/80 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                    >
                      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" d="M5 5l10 10M15 5L5 15" />
                      </svg>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {missingCount > 0 && (
            <p className="mt-4 text-[clamp(12px,0.7vw,24px)] text-[var(--kf-text-muted)]">
              <span className="num">{missingCount}</span>개 컷은 아카이브에서 내려가 표시되지 않습니다.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 border-t border-white/[0.08] px-[clamp(18px,1.2vw,44px)] py-[clamp(12px,0.8vw,28px)]">
          {mode === "shared" ? (
            <button type="button" onClick={onImportShared} disabled={items.length === 0} className={`${ACTION} col-span-2 bg-[var(--kf-champagne)] font-semibold text-[#0B0C0F] hover:bg-[var(--kf-champagne-hover)]`}>
              <BoardBookmarkIcon className="h-[var(--kf-icon)] w-[var(--kf-icon)]" />내 보드로 가져오기
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={items.length === 0}
                onClick={async () => onToast((await copyText(shareUrl())) ? "보드 공유 링크를 복사했습니다" : "링크를 복사하지 못했습니다")}
                className={`${ACTION} bg-[var(--kf-text)] font-semibold text-[#0B0C0F] hover:bg-white`}
              >
                <ShareLinkIcon className="h-[var(--kf-icon)] w-[var(--kf-icon)]" />공유 링크
              </button>
              <button
                type="button"
                disabled={items.length === 0}
                onClick={async () =>
                  onToast((await copyText(generateMoodboardMarkdown(items, shareUrl()))) ? "노션용 마크다운을 복사했습니다" : "마크다운을 복사하지 못했습니다")
                }
                className={`${ACTION} border border-white/[0.1] bg-white/[0.08] text-white hover:bg-white/[0.16]`}
              >
                <CopyIcon className="h-[var(--kf-icon)] w-[var(--kf-icon)]" />마크다운
              </button>
              {items.length > 0 && (
                <button type="button" onClick={onClear} className={`${ACTION} col-span-2 h-auto py-1 text-[var(--kf-text-muted)] hover:text-white`}>
                  보드 비우기
                </button>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
