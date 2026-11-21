"use client";

import React, { useEffect, useState } from "react";
import type { ArchiveItem } from "@/types/archive";
import {
  generateMoodboardMarkdown,
  serializeBoardIds,
} from "@/lib/taxonomy";
import {
  BoardBookmarkIcon,
  CheckIcon,
  CloseIcon,
  MarkdownDocIcon,
  ShareLinkIcon,
  ViewfinderIcon,
} from "@/components/Icons";

interface MoodboardDrawerProps {
  items: ArchiveItem[];
  boardOnly: boolean;
  onClose: () => void;
  onRemoveItem: (id: string) => void;
  onClearBoard: () => void;
  onToggleBoardOnly: () => void;
  onOpenDetail: (item: ArchiveItem) => void;
}

export function MoodboardDrawer({
  items,
  boardOnly,
  onClose,
  onRemoveItem,
  onClearBoard,
  onToggleBoardOnly,
  onOpenDetail,
}: MoodboardDrawerProps) {
  const [copiedState, setCopiedState] = useState<"url" | "md" | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const boardParam = serializeBoardIds(items.map((i) => i.id));
  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${window.location.pathname}${
          boardParam ? `?board=${boardParam}` : ""
        }`
      : `?board=${boardParam}`;

  const handleCopyShareUrl = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      // Fallback handled cleanly via state indicator
    }
    setCopiedState("url");
    window.setTimeout(() => setCopiedState(null), 1800);
  };

  const handleCopyMarkdown = async () => {
    const md = generateMoodboardMarkdown(items, shareUrl);
    try {
      await navigator.clipboard.writeText(md);
    } catch {
      // Fallback handled cleanly
    }
    setCopiedState("md");
    window.setTimeout(() => setCopiedState(null), 1800);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-darkroom-base/75 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="URL 공유 무드보드"
      onClick={onClose}
    >
      <aside
        className="flex h-full w-full max-w-md flex-col border-l border-rim bg-darkroom-mount shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-rim bg-darkroom-recessed px-4 py-3.5">
          <div className="flex items-center gap-2">
            <BoardBookmarkIcon className="h-4 w-4 text-amber-kodak" filled />
            <h2 className="font-mono text-sm font-semibold tracking-wider text-ivory">
              MOODBOARD ({items.length})
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="무드보드 닫기"
            className="rounded border border-rim p-1.5 text-silver hover:border-amber-kodak hover:text-ivory"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </header>

        {/* Share Controls */}
        <div className="space-y-2.5 border-b border-rim bg-darkroom-base p-4">
          <p className="text-xs leading-relaxed text-silver">
            무서버 URL 직렬화(<code className="font-mono text-amber-kodak">?board=</code>)로
            로그인 없이 팀원과 동일한 레퍼런스 보드를 즉시 공유합니다.
          </p>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={handleCopyShareUrl}
              disabled={items.length === 0}
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-amber-kodak px-3 py-2 text-xs font-semibold text-darkroom-base transition-colors hover:bg-amber-glow disabled:cursor-not-allowed disabled:opacity-40"
            >
              {copiedState === "url" ? (
                <>
                  <CheckIcon className="h-3.5 w-3.5" />
                  링크 복사됨
                </>
              ) : (
                <>
                  <ShareLinkIcon className="h-3.5 w-3.5" />
                  공유 링크 복사
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleCopyMarkdown}
              disabled={items.length === 0}
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-rim-strong bg-darkroom-mount px-3 py-2 text-xs font-medium text-ivory transition-colors hover:border-amber-kodak hover:text-amber-kodak disabled:cursor-not-allowed disabled:opacity-40"
            >
              {copiedState === "md" ? (
                <>
                  <CheckIcon className="h-3.5 w-3.5 text-amber-kodak" />
                  브리프 복사됨
                </>
              ) : (
                <>
                  <MarkdownDocIcon className="h-3.5 w-3.5" />
                  노션 마크다운 복사
                </>
              )}
            </button>
          </div>

          {items.length > 0 && (
            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={onToggleBoardOnly}
                className={`rounded border px-2.5 py-1 font-mono text-[11px] transition-colors ${
                  boardOnly
                    ? "border-amber-kodak bg-amber-kodak/20 text-amber-kodak"
                    : "border-rim text-silver hover:text-ivory"
                }`}
              >
                {boardOnly ? "무드보드만 보기 적용중" : "그리드에서 보드만 보기"}
              </button>
              <button
                type="button"
                onClick={onClearBoard}
                className="font-mono text-[11px] text-silver hover:text-ivory"
              >
                전체 비우기
              </button>
            </div>
          )}
        </div>

        {/* Pinned Items List */}
        <div className="flex-1 overflow-y-auto p-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-rim px-5 py-12 text-center">
              <BoardBookmarkIcon className="mb-3 h-6 w-6 text-silver" />
              <p className="text-sm font-medium text-ivory">
                담긴 레퍼런스 컷이 아직 없습니다
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-silver">
                아카이브 카드의 <span className="text-amber-kodak">보드</span> 버튼을 눌러
                캠페인 기획용 레퍼런스를 모아보세요.
              </p>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-3 rounded-lg border border-rim bg-darkroom-base p-2.5"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenDetail(item);
                    }}
                    className="relative h-16 w-20 shrink-0 overflow-hidden rounded border border-rim bg-black"
                  >
                    <img
                      src={item.thumbnailUrl}
                      alt={item.titleKo}
                      className="h-full w-full object-cover"
                    />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 font-mono text-[10px] text-silver">
                      <span className="text-amber-kodak">{item.id}</span>
                      <span>{item.mediaType}</span>
                      <span>{item.year}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenDetail(item);
                      }}
                      className="mt-0.5 block truncate text-left text-xs font-semibold text-ivory hover:text-amber-kodak"
                    >
                      {item.titleKo}
                    </button>
                    <div className="mt-1 flex items-center gap-1">
                      {item.palette.map((hex, i) => (
                        <span
                          key={`${item.id}-mb-${i}`}
                          className="h-2.5 w-2.5 rounded-[2px] border border-ivory/15"
                          style={{ backgroundColor: hex }}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenDetail(item);
                      }}
                      aria-label={`${item.titleKo} 뷰파인더 열기`}
                      className="rounded border border-rim p-1 text-silver hover:border-amber-kodak hover:text-amber-kodak"
                    >
                      <ViewfinderIcon className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveItem(item.id)}
                      aria-label={`${item.titleKo} 무드보드에서 제거`}
                      className="rounded border border-rim p-1 text-silver hover:border-rim-strong hover:text-ivory"
                    >
                      <CloseIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
