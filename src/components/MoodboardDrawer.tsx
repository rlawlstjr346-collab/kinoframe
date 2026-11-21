"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { ArchiveItem, AuthSessionState, VaultState } from "@/types/archive";
import {
  generateMoodboardMarkdown,
  getCategoryLabel,
  getCountryLabel,
  resolveItemCategory,
  resolveItemCountry,
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
  onCreateFolder: (name: string) => string;
  onRenameFolder: (folderId: string, newName: string) => void;
  onDeleteFolder: (folderId: string) => void;
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
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onExportBackup,
  onImportBackupFile,
  onOpenAuth,
}: MoodboardDrawerProps) {
  const [copiedState, setCopiedState] = useState<"url" | "md" | null>(null);
  const [activeFolderId, setActiveFolderId] = useState<string>("ALL");
  const [newBoardName, setNewBoardName] = useState<string>("");
  const [creatingBoard, setCreatingBoard] = useState<boolean>(false);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>("");
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

  const boardParam = serializeBoardIds(visibleItems.map((i) => i.id));
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
      // ignore clipboard errors
    }
    setCopiedState("url");
    window.setTimeout(() => setCopiedState(null), 1800);
  };

  const handleCopyMarkdown = async () => {
    const md = generateMoodboardMarkdown(visibleItems, shareUrl);
    try {
      await navigator.clipboard.writeText(md);
    } catch {
      // ignore clipboard errors
    }
    setCopiedState("md");
    window.setTimeout(() => setCopiedState(null), 1800);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newBoardName.trim();
    if (!trimmed) return;
    const id = onCreateFolder(trimmed);
    setActiveFolderId(id);
    setNewBoardName("");
    setCreatingBoard(false);
  };

  const handleRenameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFolderId || !editingName.trim()) return;
    onRenameFolder(editingFolderId, editingName.trim());
    setEditingFolderId(null);
    setEditingName("");
  };

  const activeFolder = vault.folders.find((f) => f.id === activeFolderId);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-[#050507]/82 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="내 보드 (My Boards)"
      onClick={onClose}
    >
      <aside
        className="flex h-full w-full max-w-[760px] flex-col border-l border-white/[0.1] bg-[#0E0F13] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-white/[0.08] px-7 py-5">
          <div className="flex items-center gap-3">
            <h2 className="text-[22px] font-bold tracking-tight text-[#FFFFFF]">
              {session.authenticated && session.user
                ? `${session.user.name}의 보드`
                : "내 보드"}
            </h2>
            {items.length > 0 && (
              <span className="rounded-full bg-[#E5A93B]/20 px-3 py-0.5 font-mono text-[14px] font-bold text-[#E5A93B]">
                {items.length}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {session.authenticated && (
              <button
                type="button"
                onClick={() => setCreatingBoard((v) => !v)}
                className="h-10 rounded-full border border-white/15 bg-[#181A22] px-4 text-[14px] font-semibold text-[#FAF8F5] hover:bg-[#232632]"
              >
                + 새 보드
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="보드 닫기"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#D0CBC0] hover:bg-white/[0.08] hover:text-white"
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* Guest Gate (unless viewing shared ?board= items) */}
        {!session.authenticated && items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
            <BoardBookmarkIcon className="mb-4 h-10 w-10 text-[#E5A93B]" />
            <h3 className="text-[22px] font-bold text-[#FFFFFF]">
              로그인하고 나만의 보드를 만들어보세요
            </h3>
            <p className="mt-2.5 max-w-md text-[16px] leading-relaxed text-[#D0CBC0]">
              계정별로 독립된 보드(`일본 빈티지 CF`, `락 포스터`, `티셔츠 그래픽`,
              `고전영화` 등)를 생성하고 원하는 이미지를 무제한 저장할 수 있습니다.
            </p>
            <button
              type="button"
              onClick={onOpenAuth}
              className="mt-6 h-12 rounded-full bg-[#FAF8F5] px-8 text-[16px] font-bold text-[#09090B] hover:bg-white"
            >
              로그인 / 계정 만들기
            </button>
          </div>
        ) : (
          <>
            {/* New Board Inline Form */}
            {creatingBoard && (
              <form
                onSubmit={handleCreateSubmit}
                className="flex items-center gap-2.5 border-b border-white/[0.08] bg-[#14161D] px-7 py-3.5"
              >
                <input
                  type="text"
                  value={newBoardName}
                  onChange={(e) => setNewBoardName(e.target.value)}
                  placeholder="새 보드 이름 (예: 90s 도쿄 네온)"
                  maxLength={32}
                  autoFocus
                  className="h-10 flex-1 rounded-full border border-white/15 bg-[#0B0C0F] px-4 text-[15px] text-[#FFFFFF] placeholder:text-[#A8A398] focus:border-[#E5A93B] focus:outline-none"
                />
                <button
                  type="submit"
                  className="h-10 rounded-full bg-[#FAF8F5] px-5 text-[14px] font-bold text-[#09090B] hover:bg-white"
                >
                  생성
                </button>
              </form>
            )}

            {/* Folder Pill Strip + Rename / Delete Active Board */}
            <div className="border-b border-white/[0.08] px-7 py-3.5">
              <div className="flex items-center gap-2 overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setActiveFolderId("ALL")}
                  className={`shrink-0 rounded-full px-4 py-1.5 text-[15px] font-semibold transition-colors ${
                    activeFolderId === "ALL"
                      ? "bg-[#FAF8F5] text-[#09090B]"
                      : "bg-[#171920] text-[#E0DCD2] hover:text-white"
                  }`}
                >
                  전체 ({items.length})
                </button>
                {vault.folders.map((folder) => {
                  const count = items.filter(
                    (i) => bookmarkByItemId.get(i.id)?.folderId === folder.id
                  ).length;
                  const active = activeFolderId === folder.id;
                  return (
                    <button
                      key={folder.id}
                      type="button"
                      onClick={() => setActiveFolderId(folder.id)}
                      className={`shrink-0 rounded-full px-4 py-1.5 text-[15px] font-semibold transition-colors ${
                        active
                          ? "bg-[#FAF8F5] text-[#09090B]"
                          : "bg-[#171920] text-[#E0DCD2] hover:text-white"
                      }`}
                    >
                      {folder.name} ({count})
                    </button>
                  );
                })}
              </div>

              {session.authenticated && activeFolder && (
                <div className="mt-3 flex items-center justify-between text-[14px] text-[#D0CBC0]">
                  {editingFolderId === activeFolder.id ? (
                    <form
                      onSubmit={handleRenameSubmit}
                      className="flex flex-1 items-center gap-2"
                    >
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="h-9 flex-1 rounded-full border border-white/20 bg-[#0B0C0F] px-3.5 text-[14px] text-white focus:border-[#E5A93B] focus:outline-none"
                      />
                      <button
                        type="submit"
                        className="rounded-full bg-[#E5A93B] px-3.5 py-1 text-[13px] font-bold text-[#09090B]"
                      >
                        변경
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingFolderId(null)}
                        className="px-2 text-[13px] text-[#C8C3B8]"
                      >
                        취소
                      </button>
                    </form>
                  ) : (
                    <>
                      <span className="font-semibold text-[#FAF8F5]">
                        {activeFolder.name}
                      </span>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingFolderId(activeFolder.id);
                            setEditingName(activeFolder.name);
                          }}
                          className="hover:text-white"
                        >
                          이름 변경
                        </button>
                        {vault.folders.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              onDeleteFolder(activeFolder.id);
                              setActiveFolderId("ALL");
                            }}
                            className="text-[#F09A92] hover:text-[#FFB8B0]"
                          >
                            보드 삭제
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* 2~3 Column Large Visual Grid */}
            <div className="flex-1 overflow-y-auto px-7 py-5">
              {visibleItems.length === 0 ? (
                <div className="flex h-full min-h-[260px] flex-col items-center justify-center text-center">
                  <BoardBookmarkIcon className="mb-3 h-8 w-8 text-[#C8C3B8]" />
                  <p className="text-[17px] font-semibold text-[#FAF8F5]">
                    이 보드에 저장된 아카이브가 없습니다
                  </p>
                  <p className="mt-1.5 text-[15px] text-[#C8C3B8]">
                    벽면 타일이나 상세 뷰의{" "}
                    <strong className="text-white">저장</strong> 버튼으로 이미지를
                    모아보세요.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  {visibleItems.map((item) => (
                    <div
                      key={item.id}
                      className="group relative overflow-hidden rounded-xl bg-[#15171F] ring-1 ring-white/[0.08] transition-all hover:ring-[#FAF8F5]/45"
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
                          <p className="truncate text-[16px] font-semibold leading-snug text-[#FFFFFF]">
                            {item.titleKo}
                          </p>
                          <p className="mt-0.5 truncate text-[13px] text-[#D0CBC0]">
                            {getCountryLabel(resolveItemCountry(item))} ·{" "}
                            {item.year} ·{" "}
                            {getCategoryLabel(resolveItemCategory(item))}
                          </p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => onRemoveItem(item.id)}
                        aria-label={`${item.titleKo} 보드에서 제거`}
                        className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#09090B]/85 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100"
                      >
                        <CloseIcon className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Bottom Share & Backup Footer */}
            <footer className="space-y-3 border-t border-white/[0.08] bg-[#0B0C0F] px-7 py-4">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handleCopyShareUrl}
                  disabled={visibleItems.length === 0}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#FAF8F5] px-4 text-[15px] font-bold text-[#09090B] hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {copiedState === "url" ? (
                    <>
                      <CheckIcon className="h-4 w-4" />
                      <span>공유 링크 복사됨</span>
                    </>
                  ) : (
                    <>
                      <ShareLinkIcon className="h-4 w-4" />
                      <span>보드 링크 공유</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleCopyMarkdown}
                  disabled={visibleItems.length === 0}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-white/[0.15] bg-[#181A22] px-4 text-[15px] font-semibold text-[#FAF8F5] hover:bg-[#232632] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {copiedState === "md" ? (
                    <>
                      <CheckIcon className="h-4 w-4 text-[#E5A93B]" />
                      <span>리스트 복사됨</span>
                    </>
                  ) : (
                    <>
                      <MarkdownDocIcon className="h-4 w-4" />
                      <span>마크다운 목록 복사</span>
                    </>
                  )}
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[14px] text-[#D0CBC0]">
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={onExportBackup}
                    className="hover:text-white"
                  >
                    JSON 백업
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="hover:text-white"
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
                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={onToggleBoardOnly}
                      className={
                        boardOnly
                          ? "font-semibold text-[#E5A93B]"
                          : "hover:text-white"
                      }
                    >
                      {boardOnly ? "벽면 필터 해제" : "보드 컷만 보기"}
                    </button>
                    <button
                      type="button"
                      onClick={onClearBoard}
                      className="hover:text-white"
                    >
                      전체 비우기
                    </button>
                  </div>
                )}
              </div>
            </footer>
          </>
        )}
      </aside>
    </div>
  );
}
