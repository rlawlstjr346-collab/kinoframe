"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { ArchiveItem, AuthSessionState, VaultState } from "@/types/archive";
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
} from "@/components/Icons";

interface MoodboardDrawerProps {
  items: ArchiveItem[];
  vault: VaultState;
  session: AuthSessionState;
  boardOnly: boolean;
  onClose: () => void;
  onRemoveItem: (id: string) => void;
  onClearBoard: () => void;
  onToggleBoardOnly: () => void;
  onOpenDetail: (item: ArchiveItem) => void;
  onExportBackup: () => void;
  onImportBackupFile: (file: File) => void;
  onOpenAuth: () => void;
}

export function MoodboardDrawer({
  items,
  vault,
  session,
  boardOnly,
  onClose,
  onRemoveItem,
  onClearBoard,
  onToggleBoardOnly,
  onOpenDetail,
  onExportBackup,
  onImportBackupFile,
  onOpenAuth,
}: MoodboardDrawerProps) {
  const [copiedState, setCopiedState] = useState<"url" | "md" | null>(null);
  const [activeFolderId, setActiveFolderId] = useState<string>("ALL");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const bookmarkByItemId = useMemo(() => {
    const map = new Map<string, VaultState["bookmarks"][number]>();
    for (const b of vault.bookmarks) {
      map.set(b.itemId, b);
    }
    return map;
  }, [vault.bookmarks]);

  const visibleItems = useMemo(() => {
    if (activeFolderId === "ALL") return items;
    return items.filter(
      (item) => bookmarkByItemId.get(item.id)?.folderId === activeFolderId
    );
  }, [items, activeFolderId, bookmarkByItemId]);

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
      // Fallback handled cleanly
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
      className="fixed inset-0 z-50 flex justify-end bg-[#050507]/80 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="레퍼런스 보관함"
      onClick={onClose}
    >
      <aside
        className="flex h-full w-full max-w-[520px] flex-col border-l border-white/[0.09] bg-[#0E0F13] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Clean Cosmos-Style Header */}
        <header className="flex items-center justify-between border-b border-white/[0.08] px-6 py-5">
          <div className="flex items-center gap-3">
            <h2 className="text-[20px] font-semibold tracking-tight text-[#FAF8F5]">
              보관함
            </h2>
            {items.length > 0 && (
              <span className="rounded-full bg-white/[0.08] px-2.5 py-0.5 font-mono text-[13px] font-medium text-[#E5A93B]">
                {items.length}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {session.cloudSyncAvailable && (
              <button
                type="button"
                onClick={onOpenAuth}
                className="rounded-full bg-[#E5A93B]/15 px-3 py-1 text-[12px] font-medium text-[#E5A93B]"
              >
                클라우드 동기화
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="보관함 닫기"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[#C8C3B8] transition-colors hover:bg-white/[0.08] hover:text-white"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Clean 14px Folder Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto border-b border-white/[0.08] px-6 py-3.5">
          <button
            type="button"
            onClick={() => setActiveFolderId("ALL")}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-[14px] font-medium transition-colors ${
              activeFolderId === "ALL"
                ? "bg-[#F4F1EA] font-semibold text-[#09090B]"
                : "bg-[#171920] text-[#D0CBC0] hover:text-white"
            }`}
          >
            전체
          </button>
          {vault.folders.map((folder) => {
            const active = activeFolderId === folder.id;
            return (
              <button
                key={folder.id}
                type="button"
                onClick={() => setActiveFolderId(folder.id)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-[14px] font-medium transition-colors ${
                  active
                    ? "bg-[#F4F1EA] font-semibold text-[#09090B]"
                    : "bg-[#171920] text-[#D0CBC0] hover:text-white"
                }`}
              >
                {folder.name}
              </button>
            );
          })}
        </div>

        {/* Airy 2-Column Visual Collection Grid */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {visibleItems.length === 0 ? (
            <div className="flex h-full min-h-[260px] flex-col items-center justify-center text-center">
              <BoardBookmarkIcon className="mb-3 h-7 w-7 text-[#C8C3B8]" />
              <p className="text-[16px] font-medium text-[#FAF8F5]">
                {items.length === 0
                  ? "아직 보관한 레퍼런스가 없습니다"
                  : "이 폴더에 담긴 레퍼런스가 없습니다"}
              </p>
              <p className="mt-2 max-w-xs text-[14px] leading-relaxed text-[#C8C3B8]">
                마음에 드는 프레임의 북마크 버튼이나 상세 화면의{" "}
                <strong className="text-[#FAF8F5]">보관</strong> 버튼을 눌러 나만의 컬렉션을 만들어보세요.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3.5">
              {visibleItems.map((item) => (
                <div
                  key={item.id}
                  className="group relative overflow-hidden rounded-lg bg-[#141519] ring-1 ring-white/[0.08] transition-all hover:ring-[#E5A93B]/60"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenDetail(item);
                    }}
                    className="block w-full text-left"
                  >
                    <div className="aspect-[4/3] w-full overflow-hidden bg-black">
                      <img
                        src={item.thumbnailUrl}
                        alt={item.titleKo}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    </div>
                    <div className="p-3">
                      <p className="truncate text-[15px] font-medium leading-snug text-[#FAF8F5]">
                        {item.titleKo}
                      </p>
                      <p className="mt-0.5 truncate font-mono text-[12px] text-[#C8C3B8]">
                        {item.mediaType} · {item.year}
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => onRemoveItem(item.id)}
                    aria-label={`${item.titleKo} 보관함에서 제거`}
                    className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#09090B]/80 text-[#FAF8F5] opacity-0 backdrop-blur-sm transition-opacity hover:bg-[#09090B] group-hover:opacity-100"
                  >
                    <CloseIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Clean Bottom 2-Button Action Footer + Subtle Backup Sub-Menu */}
        <footer className="space-y-3 border-t border-white/[0.08] bg-[#0B0C0F] px-6 py-4">
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={handleCopyShareUrl}
              disabled={items.length === 0}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#F4F1EA] px-4 text-[14px] font-semibold text-[#09090B] transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {copiedState === "url" ? (
                <>
                  <CheckIcon className="h-4 w-4" />
                  <span>링크 복사됨</span>
                </>
              ) : (
                <>
                  <ShareLinkIcon className="h-4 w-4" />
                  <span>공유 링크 복사</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleCopyMarkdown}
              disabled={items.length === 0}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-white/[0.14] bg-[#181A22] px-4 text-[14px] font-medium text-[#FAF8F5] transition-colors hover:bg-[#222530] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {copiedState === "md" ? (
                <>
                  <CheckIcon className="h-4 w-4 text-[#E5A93B]" />
                  <span>브리프 복사됨</span>
                </>
              ) : (
                <>
                  <MarkdownDocIcon className="h-4 w-4" />
                  <span>기획안 브리프 복사</span>
                </>
              )}
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[13px] text-[#C4BFB4]">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onExportBackup}
                className="transition-colors hover:text-[#FAF8F5]"
              >
                백업 저장
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="transition-colors hover:text-[#FAF8F5]"
              >
                백업 불러오기
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.kinoframe.json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    onImportBackupFile(file);
                    e.target.value = "";
                  }
                }}
              />
            </div>

            {items.length > 0 && (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onToggleBoardOnly}
                  className={`transition-colors ${
                    boardOnly ? "font-semibold text-[#E5A93B]" : "hover:text-[#FAF8F5]"
                  }`}
                >
                  {boardOnly ? "벽면 필터 해제" : "보관함만 보기"}
                </button>
                <button
                  type="button"
                  onClick={onClearBoard}
                  className="transition-colors hover:text-[#FAF8F5]"
                >
                  전체 비우기
                </button>
              </div>
            )}
          </div>
        </footer>
      </aside>
    </div>
  );
}
