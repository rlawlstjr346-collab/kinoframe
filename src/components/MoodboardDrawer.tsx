"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { ArchiveItem, AuthSessionState, VaultState } from "@/types/archive";
import {
  formatPreciseTimestamp,
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

  const folderNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of vault.folders) {
      map.set(f.id, f.name);
    }
    return map;
  }, [vault.folders]);

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
      className="fixed inset-0 z-50 flex justify-end bg-darkroom-base/78 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="레퍼런스 보관함 및 무드보드"
      onClick={onClose}
    >
      <aside
        className="flex h-full w-full max-w-lg flex-col border-l border-rim bg-darkroom-mount shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-rim bg-darkroom-recessed px-5 py-4">
          <div className="flex items-center gap-2.5">
            <BoardBookmarkIcon className="h-4 w-4 text-amber-kodak" filled />
            <h2 className="font-mono text-sm font-semibold tracking-wider text-ivory">
              ARCHIVE VAULT ({items.length})
            </h2>
            <button
              type="button"
              onClick={onOpenAuth}
              className={`rounded-[3px] px-2 py-0.5 font-mono text-[11px] transition-colors ${
                session.cloudSyncAvailable
                  ? "bg-amber-kodak/20 text-amber-kodak"
                  : "border border-rim bg-darkroom-base text-silver hover:text-ivory"
              }`}
            >
              {session.cloudSyncAvailable
                ? "클라우드 동기화"
                : session.authenticated
                ? `${session.user?.name} · 로컬`
                : "로컬 보관함"}
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="보관함 닫기"
            className="rounded border border-rim p-1.5 text-silver hover:border-amber-kodak hover:text-ivory"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </header>

        {/* Share & Backup Controls */}
        <div className="space-y-3 border-b border-rim bg-darkroom-base p-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleCopyShareUrl}
              disabled={items.length === 0}
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-amber-kodak px-3 py-2 text-xs font-semibold text-darkroom-base transition-colors hover:bg-amber-glow disabled:cursor-not-allowed disabled:opacity-40"
            >
              {copiedState === "url" ? (
                <>
                  <CheckIcon className="h-3.5 w-3.5" />
                  공유 링크 복사됨
                </>
              ) : (
                <>
                  <ShareLinkIcon className="h-3.5 w-3.5" />
                  ?board= 링크 복사
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

          {/* Local JSON File Backup & Restore */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onExportBackup}
                className="rounded border border-rim bg-darkroom-mount px-2.5 py-1 font-mono text-xs text-ivory hover:border-amber-kodak hover:text-amber-kodak"
              >
                .kinoframe.json 내보내기
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded border border-rim bg-darkroom-mount px-2.5 py-1 font-mono text-xs text-silver hover:border-amber-kodak hover:text-ivory"
              >
                불러오기
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
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onToggleBoardOnly}
                  className={`rounded border px-2 py-1 font-mono text-xs transition-colors ${
                    boardOnly
                      ? "border-amber-kodak bg-amber-kodak/20 text-amber-kodak"
                      : "border-rim text-silver hover:text-ivory"
                  }`}
                >
                  {boardOnly ? "보관함만 보기중" : "벽면 필터"}
                </button>
                <button
                  type="button"
                  onClick={onClearBoard}
                  className="font-mono text-xs text-silver hover:text-ivory"
                >
                  비우기
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Folder Filter Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto border-b border-rim bg-darkroom-mount px-4 py-2.5">
          <button
            type="button"
            onClick={() => setActiveFolderId("ALL")}
            className={`shrink-0 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
              activeFolderId === "ALL"
                ? "bg-amber-kodak font-semibold text-darkroom-base"
                : "bg-darkroom-base text-silver hover:text-ivory"
            }`}
          >
            전체 ({items.length})
          </button>
          {vault.folders.map((folder) => {
            const count = items.filter(
              (item) => bookmarkByItemId.get(item.id)?.folderId === folder.id
            ).length;
            const active = activeFolderId === folder.id;
            return (
              <button
                key={folder.id}
                type="button"
                onClick={() => setActiveFolderId(folder.id)}
                className={`shrink-0 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  active
                    ? "bg-amber-kodak font-semibold text-darkroom-base"
                    : "bg-darkroom-base text-silver hover:text-ivory"
                }`}
              >
                {folder.name} ({count})
              </button>
            );
          })}
        </div>

        {/* Pinned Items List */}
        <div className="flex-1 overflow-y-auto p-4">
          {visibleItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-rim px-5 py-12 text-center">
              <BoardBookmarkIcon className="mb-3 h-6 w-6 text-silver" />
              <p className="text-sm font-medium text-ivory">
                {items.length === 0
                  ? "담긴 레퍼런스 컷이 아직 없습니다"
                  : "이 폴더에 담긴 레퍼런스가 없습니다"}
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-silver">
                타일의 북마크 아이콘이나 라이트박스{" "}
                <span className="text-amber-kodak">보관함 · 연관</span> 탭에서 폴더·메모와 함께 저장해보세요.
              </p>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {visibleItems.map((item) => {
                const meta = bookmarkByItemId.get(item.id);
                const folderName = meta
                  ? folderNameById.get(meta.folderId)
                  : null;
                return (
                  <li
                    key={item.id}
                    className="flex items-start gap-3 rounded-lg border border-rim bg-darkroom-base p-3"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenDetail(item);
                      }}
                      className="relative h-16 w-24 shrink-0 overflow-hidden rounded border border-rim bg-black"
                    >
                      <img
                        src={item.thumbnailUrl}
                        alt={item.titleKo}
                        className="h-full w-full object-cover"
                      />
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-silver">
                        <span className="text-amber-kodak">{item.id}</span>
                        <span>{item.mediaType}</span>
                        <span>{item.year}</span>
                        {folderName && (
                          <span className="rounded bg-darkroom-mount px-1.5 py-0.5 text-[10px] text-ivory">
                            {folderName}
                          </span>
                        )}
                        {meta?.timestampSec !== null &&
                          meta?.timestampSec !== undefined && (
                            <span className="rounded bg-amber-kodak/15 px-1.5 py-0.5 text-[10px] text-amber-kodak">
                              {formatPreciseTimestamp(meta.timestampSec)}
                            </span>
                          )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenDetail(item);
                        }}
                        className="mt-1 block truncate text-left text-sm font-semibold text-ivory hover:text-amber-kodak"
                      >
                        {item.titleKo}
                      </button>
                      {meta?.memo && (
                        <p className="mt-1 line-clamp-2 text-xs text-silver">
                          {meta.memo}
                        </p>
                      )}
                      <div className="mt-1.5 flex items-center gap-1">
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
                        aria-label={`${item.titleKo} 라이트박스 열기`}
                        className="rounded border border-rim p-1.5 text-silver hover:border-amber-kodak hover:text-amber-kodak"
                      >
                        <ViewfinderIcon className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveItem(item.id)}
                        aria-label={`${item.titleKo} 보관함에서 제거`}
                        className="rounded border border-rim p-1.5 text-silver hover:border-rim-strong hover:text-ivory"
                      >
                        <CloseIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
