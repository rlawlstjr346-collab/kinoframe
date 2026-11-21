"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type {
  ArchiveItem,
  AuthSessionState,
  CompositionTag,
  Era,
  FilterState,
  MediaType,
  PersuasionTag,
  SortOption,
  VaultState,
} from "@/types/archive";
import {
  COMPOSITION_TAGS,
  DEFAULT_FILTER_STATE,
  ERAS,
  MEDIA_TYPES,
  PERSUASION_TAGS,
  SORT_OPTIONS,
  filterAndSortArchive,
  parseBoardIds,
  rotateArchiveWithSeed,
  serializeBoardIds,
} from "@/lib/taxonomy";
import {
  DEFAULT_VAULT_STATE,
  exportVaultToFile,
  loadLocalVault,
  parseImportedVaultJson,
  saveLocalVault,
} from "@/lib/vault";
import {
  BoardBookmarkIcon,
  CloseIcon,
  CompareIcon,
  KinoframeLogo,
  ResetIcon,
  SearchIcon,
} from "@/components/Icons";
import { SlideMountCard } from "@/components/SlideMountCard";
import { ViewfinderModal } from "@/components/ViewfinderModal";
import { CompareDrawer } from "@/components/CompareDrawer";
import { MoodboardDrawer } from "@/components/MoodboardDrawer";
import { AuthModal } from "@/components/AuthModal";

interface ArchiveWorkbenchProps {
  items: ArchiveItem[];
}

export function ArchiveWorkbench({ items }: ArchiveWorkbenchProps) {
  const searchParams = useSearchParams();
  const validIdSet = useMemo(() => new Set(items.map((i) => i.id)), [items]);

  const initialBoardIds = useMemo(
    () => parseBoardIds(searchParams.get("board"), validIdSet),
    [searchParams, validIdSet]
  );

  const [filterState, setFilterState] = useState<FilterState>(() => ({
    ...DEFAULT_FILTER_STATE,
    sort: "smart_mix",
    boardIds: initialBoardIds,
  }));

  // Client-only visit seed prevents SSR hydration mismatch while shuffling each visit
  const [shuffleSeed, setShuffleSeed] = useState<number | null>(null);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState<boolean>(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [compareOpen, setCompareOpen] = useState<boolean>(false);
  const [boardOpen, setBoardOpen] = useState<boolean>(false);
  const [authOpen, setAuthOpen] = useState<boolean>(false);
  const [sharedBannerDismissed, setSharedBannerDismissed] =
    useState<boolean>(false);

  // Vault & OAuth session states
  const [vault, setVault] = useState<VaultState>(DEFAULT_VAULT_STATE);
  const [vaultHydrated, setVaultHydrated] = useState<boolean>(false);
  const [session, setSession] = useState<AuthSessionState>({
    authenticated: false,
    user: null,
    cloudSyncAvailable: false,
  });

  // Initialize visit smart-mix seed & hydrate local/cloud vault + auth session
  useEffect(() => {
    const visitSeed =
      Math.floor(Date.now() % 1_000_000) + Math.floor(Math.random() * 9973) + 1;
    setShuffleSeed(visitSeed);

    const local = loadLocalVault();
    setVault(local);
    setVaultHydrated(true);

    // Merge local vault bookmark ids into boardIds if URL didn't specify ?board=
    if (initialBoardIds.length === 0 && local.bookmarks.length > 0) {
      const localIds = local.bookmarks
        .map((b) => b.itemId)
        .filter((id) => validIdSet.has(id));
      if (localIds.length > 0) {
        setFilterState((prev) => ({
          ...prev,
          boardIds: Array.from(new Set([...prev.boardIds, ...localIds])),
        }));
      }
    }

    let cancelled = false;
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then(async (sessionData: AuthSessionState) => {
        if (cancelled) return;
        setSession(sessionData);
        if (sessionData.cloudSyncAvailable) {
          const vaultRes = await fetch("/api/vault");
          if (vaultRes.ok) {
            const cloud = (await vaultRes.json()) as {
              vault?: VaultState | null;
            };
            if (!cancelled && cloud.vault && cloud.vault.bookmarks.length > 0) {
              setVault(cloud.vault);
              saveLocalVault(cloud.vault);
              const cloudIds = cloud.vault.bookmarks
                .map((b) => b.itemId)
                .filter((id) => validIdSet.has(id));
              if (cloudIds.length > 0) {
                setFilterState((prev) => ({
                  ...prev,
                  boardIds: Array.from(new Set([...prev.boardIds, ...cloudIds])),
                }));
              }
            }
          }
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [initialBoardIds.length, validIdSet]);

  // Persist vault locally and sync to Supabase when authenticated
  useEffect(() => {
    if (!vaultHydrated) return;
    saveLocalVault(vault);
    if (session.cloudSyncAvailable) {
      fetch("/api/vault", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vault }),
      }).catch(() => {});
    }
  }, [vault, vaultHydrated, session.cloudSyncAvailable]);

  // Sync URL ?board= parameter cleanly without full page reload
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const serialized = serializeBoardIds(filterState.boardIds);
    if (serialized) {
      url.searchParams.set("board", serialized);
    } else {
      url.searchParams.delete("board");
    }
    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState(null, "", nextUrl);
  }, [filterState.boardIds]);

  const filteredItems = useMemo(() => {
    const base = filterAndSortArchive(items, filterState);
    if (filterState.sort === "smart_mix" && shuffleSeed !== null) {
      return rotateArchiveWithSeed(base, shuffleSeed);
    }
    return base;
  }, [items, filterState, shuffleSeed]);

  const mediaCounts = useMemo(() => {
    const counts: Record<MediaType | "ALL", number> = {
      ALL: items.length,
      TVCF: 0,
      NEWS: 0,
      PRINT: 0,
      PHOTO: 0,
    };
    for (const item of items) {
      counts[item.mediaType] += 1;
    }
    return counts;
  }, [items]);

  const boardItems = useMemo(() => {
    const map = new Map(items.map((i) => [i.id, i]));
    return filterState.boardIds
      .map((id) => map.get(id))
      .filter((x): x is ArchiveItem => Boolean(x));
  }, [items, filterState.boardIds]);

  const selectedIndex = useMemo(
    () =>
      selectedItemId
        ? filteredItems.findIndex((i) => i.id === selectedItemId)
        : -1,
    [filteredItems, selectedItemId]
  );

  const selectedItem = useMemo(() => {
    if (!selectedItemId) return null;
    return items.find((i) => i.id === selectedItemId) ?? null;
  }, [items, selectedItemId]);

  const selectedBookmark = useMemo(() => {
    if (!selectedItemId) return undefined;
    return vault.bookmarks.find((b) => b.itemId === selectedItemId);
  }, [vault.bookmarks, selectedItemId]);

  const taxonomyActiveCount =
    filterState.compositionTags.length +
    filterState.persuasionTags.length +
    (filterState.era !== "ALL" ? 1 : 0);

  const hasActiveFilters =
    filterState.mediaType !== "ALL" ||
    taxonomyActiveCount > 0 ||
    filterState.query.trim().length > 0 ||
    filterState.boardOnly;

  const handleShuffleWall = useCallback(() => {
    setFilterState((prev) => ({ ...prev, sort: "smart_mix" }));
    setShuffleSeed((prev) => (prev ?? 1) + Math.floor(Math.random() * 997) + 17);
  }, []);

  const handleToggleComposition = useCallback((tag: CompositionTag) => {
    setFilterState((prev) => ({
      ...prev,
      compositionTags: prev.compositionTags.includes(tag)
        ? prev.compositionTags.filter((t) => t !== tag)
        : [...prev.compositionTags, tag],
    }));
  }, []);

  const handleTogglePersuasion = useCallback((tag: PersuasionTag) => {
    setFilterState((prev) => ({
      ...prev,
      persuasionTags: prev.persuasionTags.includes(tag)
        ? prev.persuasionTags.filter((t) => t !== tag)
        : [...prev.persuasionTags, tag],
    }));
  }, []);

  const handleApplyCompositionFromModal = useCallback((tag: CompositionTag) => {
    setFilterState((prev) => ({
      ...prev,
      compositionTags: prev.compositionTags.includes(tag)
        ? prev.compositionTags
        : [...prev.compositionTags, tag],
    }));
    setSelectedItemId(null);
  }, []);

  const handleApplyPersuasionFromModal = useCallback((tag: PersuasionTag) => {
    setFilterState((prev) => ({
      ...prev,
      persuasionTags: prev.persuasionTags.includes(tag)
        ? prev.persuasionTags
        : [...prev.persuasionTags, tag],
    }));
    setSelectedItemId(null);
  }, []);

  const handleToggleBoard = useCallback((id: string) => {
    setFilterState((prev) => {
      const exists = prev.boardIds.includes(id);
      const nextBoardIds = exists
        ? prev.boardIds.filter((b) => b !== id)
        : [...prev.boardIds, id];
      return {
        ...prev,
        boardIds: nextBoardIds,
        boardOnly: nextBoardIds.length === 0 ? false : prev.boardOnly,
      };
    });

    setVault((prev) => {
      const exists = prev.bookmarks.some((b) => b.itemId === id);
      if (exists) {
        return {
          ...prev,
          bookmarks: prev.bookmarks.filter((b) => b.itemId !== id),
        };
      }
      return {
        ...prev,
        bookmarks: [
          ...prev.bookmarks,
          {
            itemId: id,
            folderId: prev.folders[0]?.id || "hook-3s",
            timestampSec: null,
            memo: "",
            savedAt: new Date().toISOString(),
          },
        ],
      };
    });
  }, []);

  const handleSaveToVault = useCallback(
    (payload: {
      itemId: string;
      folderId: string;
      timestampSec: number | null;
      memo: string;
    }) => {
      setVault((prev) => {
        const filtered = prev.bookmarks.filter(
          (b) => b.itemId !== payload.itemId
        );
        return {
          ...prev,
          bookmarks: [
            ...filtered,
            {
              ...payload,
              savedAt: new Date().toISOString(),
            },
          ],
        };
      });
      setFilterState((prev) =>
        prev.boardIds.includes(payload.itemId)
          ? prev
          : { ...prev, boardIds: [...prev.boardIds, payload.itemId] }
      );
    },
    []
  );

  const handleCreateFolder = useCallback((name: string): string => {
    const id = `folder-${Date.now().toString(36)}`;
    setVault((prev) => ({
      ...prev,
      folders: [...prev.folders, { id, name }],
    }));
    return id;
  }, []);

  const handleClearBoard = useCallback(() => {
    setFilterState((prev) => ({
      ...prev,
      boardIds: [],
      boardOnly: false,
    }));
    setVault((prev) => ({ ...prev, bookmarks: [] }));
  }, []);

  const handleToggleCompare = useCallback((id: string) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((c) => c !== id);
      }
      if (prev.length >= 2) return prev;
      return [...prev, id];
    });
  }, []);

  const handleReplaceCompareSlot = useCallback(
    (slotIndex: 0 | 1, itemId: string) => {
      setCompareIds((prev) => {
        const next = [...prev];
        next[slotIndex] = itemId;
        return next.filter(Boolean).slice(0, 2);
      });
    },
    []
  );

  const handleResetFilters = useCallback(() => {
    setFilterState((prev) => ({
      ...DEFAULT_FILTER_STATE,
      sort: "smart_mix",
      boardIds: prev.boardIds,
    }));
  }, []);

  const handleExportBackup = useCallback(() => {
    exportVaultToFile(vault, filterState.boardIds);
  }, [vault, filterState.boardIds]);

  const handleImportBackupFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== "string") return;
        const parsed = parseImportedVaultJson(reader.result, validIdSet);
        if (!parsed) return;
        setVault(parsed.vault);
        saveLocalVault(parsed.vault);
        setFilterState((prev) => ({
          ...prev,
          boardIds: Array.from(new Set([...prev.boardIds, ...parsed.boardIds])),
        }));
      };
      reader.readAsText(file);
    },
    [validIdSet]
  );

  const handleLogout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setSession({
      authenticated: false,
      user: null,
      cloudSyncAvailable: false,
    });
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-[#09090B]">
      {/* Enlarged High-Readability Translucent Sticky Ribbon Header */}
      <header className="sticky top-0 z-30 border-b border-[#F4F1EA]/[0.08] bg-[#09090B]/90 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[2560px] flex-wrap items-center justify-between gap-x-3 gap-y-2.5 px-3 py-3 sm:px-5 lg:px-7">
          {/* Left: Logo + Media Quick Tabs */}
          <div className="flex items-center gap-3.5 overflow-x-auto">
            <button
              type="button"
              onClick={handleResetFilters}
              className="flex shrink-0 items-center gap-2.5 text-left"
              aria-label="KINOFRAME 홈 및 필터 초기화"
            >
              <KinoframeLogo className="h-7 w-7 shrink-0" />
              <span className="font-mono text-base font-bold tracking-[0.18em] text-ivory sm:text-lg">
                KINOFRAME
              </span>
            </button>

            <span
              className="hidden h-5 w-px bg-[#F4F1EA]/12 sm:inline-block"
              aria-hidden="true"
            />

            <nav
              className="flex items-center gap-1"
              role="tablist"
              aria-label="매체 카테고리"
            >
              {MEDIA_TYPES.map((m) => {
                const active = filterState.mediaType === m.value;
                return (
                  <button
                    key={m.value}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() =>
                      setFilterState((prev) => ({
                        ...prev,
                        mediaType: m.value as MediaType | "ALL",
                      }))
                    }
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-[4px] px-3.5 py-1.5 text-sm font-medium transition-colors ${
                      active
                        ? "bg-[#D99B26] font-semibold text-[#09090B]"
                        : "text-silver hover:bg-[#F4F1EA]/[0.07] hover:text-ivory"
                    }`}
                  >
                    <span>{m.label}</span>
                    <span
                      className={`font-mono text-xs ${
                        active ? "text-[#09090B]/75" : "text-silver/65"
                      }`}
                    >
                      {mediaCounts[m.value]}
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Center: Readable Slim Search Input */}
          <div className="relative order-3 w-full sm:w-72 xl:order-2 xl:mx-2 xl:w-80">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-silver/70" />
            <input
              type="search"
              value={filterState.query}
              onChange={(e) =>
                setFilterState((prev) => ({
                  ...prev,
                  query: e.target.value,
                }))
              }
              placeholder="제목·브랜드·구도·3초 훅 검색..."
              aria-label="아카이브 키워드 검색"
              className="w-full rounded-[4px] border border-[#F4F1EA]/[0.12] bg-[#111216]/90 py-1.5 pl-9 pr-8 text-sm text-ivory placeholder:text-silver/55 focus:border-[#D99B26] focus:outline-none"
            />
            {filterState.query && (
              <button
                type="button"
                onClick={() =>
                  setFilterState((prev) => ({ ...prev, query: "" }))
                }
                aria-label="검색어 지우기"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-silver hover:text-ivory"
              >
                <CloseIcon className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Right: Shuffle + Taxonomy Filter + Sort + Compare + Vault + Login */}
          <div className="order-2 flex shrink-0 flex-wrap items-center gap-2 xl:order-3">
            <button
              type="button"
              onClick={handleShuffleWall}
              title="색감·매체 균형을 유지하며 새로운 조합으로 즉시 셔플"
              className="inline-flex items-center gap-1 rounded-[4px] border border-[#F4F1EA]/[0.14] bg-[#111216] px-3 py-1.5 text-sm font-medium text-ivory transition-colors hover:border-[#D99B26] hover:text-[#D99B26]"
            >
              <span>셔플 ↻</span>
            </button>

            <button
              type="button"
              onClick={() => setFilterDrawerOpen((v) => !v)}
              aria-expanded={filterDrawerOpen}
              className={`inline-flex items-center gap-1.5 rounded-[4px] border px-3 py-1.5 text-sm font-medium transition-colors ${
                filterDrawerOpen || taxonomyActiveCount > 0
                  ? "border-[#D99B26]/70 bg-[#D99B26]/15 text-[#D99B26]"
                  : "border-[#F4F1EA]/[0.14] bg-[#111216] text-ivory hover:border-[#F4F1EA]/30"
              }`}
            >
              <span>구도·설득 필터</span>
              {taxonomyActiveCount > 0 && (
                <span className="rounded bg-[#D99B26] px-1.5 py-0.5 font-mono text-xs font-bold leading-none text-[#09090B]">
                  {taxonomyActiveCount}
                </span>
              )}
            </button>

            <select
              aria-label="정렬 기준"
              value={filterState.sort}
              onChange={(e) =>
                setFilterState((prev) => ({
                  ...prev,
                  sort: e.target.value as SortOption,
                }))
              }
              className="rounded-[4px] border border-[#F4F1EA]/[0.14] bg-[#111216] px-2.5 py-1.5 text-sm text-ivory focus:border-[#D99B26] focus:outline-none"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setCompareOpen(true)}
              className={`inline-flex items-center gap-1.5 rounded-[4px] border px-3 py-1.5 text-sm font-medium transition-colors ${
                compareIds.length > 0
                  ? "border-[#D99B26] bg-[#D99B26]/15 text-[#D99B26]"
                  : "border-[#F4F1EA]/[0.14] bg-[#111216] text-ivory hover:border-[#F4F1EA]/30"
              }`}
            >
              <CompareIcon className="h-4 w-4" />
              <span className="hidden sm:inline">비교</span>
              <span className="font-mono text-xs opacity-85">
                {compareIds.length}/2
              </span>
            </button>

            <button
              type="button"
              onClick={() => setBoardOpen(true)}
              className={`inline-flex items-center gap-1.5 rounded-[4px] border px-3 py-1.5 text-sm font-medium transition-colors ${
                filterState.boardIds.length > 0
                  ? "border-[#D99B26] bg-[#D99B26] font-semibold text-[#09090B]"
                  : "border-[#F4F1EA]/[0.14] bg-[#111216] text-ivory hover:border-[#F4F1EA]/30"
              }`}
            >
              <BoardBookmarkIcon
                className="h-4 w-4"
                filled={filterState.boardIds.length > 0}
              />
              <span className="hidden sm:inline">보관함</span>
              <span className="font-mono text-xs opacity-85">
                {filterState.boardIds.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setAuthOpen(true)}
              className={`inline-flex items-center gap-1.5 rounded-[4px] border px-3 py-1.5 text-sm font-medium transition-colors ${
                session.authenticated
                  ? "border-[#D99B26]/60 bg-[#D99B26]/12 text-[#D99B26]"
                  : "border-[#F4F1EA]/[0.16] bg-[#111216] text-ivory hover:border-[#D99B26] hover:text-[#D99B26]"
              }`}
            >
              <span>
                {session.authenticated && session.user
                  ? session.user.name
                  : "로그인"}
              </span>
            </button>
          </div>
        </div>

        {/* Collapsible Dual Taxonomy & Era Drawer */}
        {filterDrawerOpen && (
          <section
            aria-label="이중 택소노미 및 연대 필터"
            className="border-t border-[#F4F1EA]/[0.07] bg-[#0C0D10]/96"
          >
            <div className="mx-auto w-full max-w-[2560px] space-y-3 px-3 py-3.5 sm:px-5 lg:px-7">
              <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-12">
                {/* Axis A: Visual Composition Taxonomy */}
                <div className="space-y-2 lg:col-span-5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold uppercase tracking-widest text-silver">
                      AXIS A · 시각 구도
                    </span>
                    {filterState.compositionTags.length > 0 && (
                      <span className="font-mono text-xs text-ivory">
                        {filterState.compositionTags.length}개 선택
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {COMPOSITION_TAGS.map((tag) => {
                      const active = filterState.compositionTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => handleToggleComposition(tag)}
                          aria-pressed={active}
                          className={`rounded-[4px] border px-3 py-1.5 text-xs font-medium transition-colors ${
                            active
                              ? "border-ivory bg-ivory font-semibold text-[#09090B]"
                              : "border-[#F4F1EA]/[0.12] bg-[#111216] text-silver hover:border-[#F4F1EA]/30 hover:text-ivory"
                          }`}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Axis B: Marketing Persuasion Hook Taxonomy */}
                <div className="space-y-2 lg:col-span-4">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold uppercase tracking-widest text-[#D99B26]">
                      AXIS B · 마케팅 설득 훅
                    </span>
                    {filterState.persuasionTags.length > 0 && (
                      <span className="font-mono text-xs text-[#D99B26]">
                        {filterState.persuasionTags.length}개 선택
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {PERSUASION_TAGS.map((tag) => {
                      const active = filterState.persuasionTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => handleTogglePersuasion(tag)}
                          aria-pressed={active}
                          className={`rounded-[4px] border px-3 py-1.5 text-xs font-medium transition-colors ${
                            active
                              ? "border-[#D99B26] bg-[#D99B26] font-semibold text-[#09090B]"
                              : "border-[#D99B26]/30 bg-[#111216] text-silver hover:border-[#D99B26]/70 hover:text-ivory"
                          }`}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Era Filter */}
                <div className="space-y-2 lg:col-span-3">
                  <span className="block font-mono text-xs font-semibold uppercase tracking-widest text-silver">
                    ERA · 제작 연대
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {ERAS.map((era) => {
                      const active = filterState.era === era.value;
                      return (
                        <button
                          key={era.value}
                          type="button"
                          onClick={() =>
                            setFilterState((prev) => ({
                              ...prev,
                              era: era.value as Era | "ALL",
                            }))
                          }
                          aria-pressed={active}
                          className={`rounded-[4px] border px-3 py-1.5 font-mono text-xs transition-colors ${
                            active
                              ? "border-[#D99B26] bg-[#D99B26]/20 font-semibold text-[#D99B26]"
                              : "border-[#F4F1EA]/[0.12] bg-[#111216] text-silver hover:border-[#F4F1EA]/30 hover:text-ivory"
                          }`}
                        >
                          {era.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-[#F4F1EA]/[0.07] pt-2.5 font-mono text-xs text-silver">
                <span>
                  표시 결과:{" "}
                  <strong className="text-ivory">{filteredItems.length}</strong> /{" "}
                  {items.length} 프레임
                </span>
                <div className="flex items-center gap-2">
                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={handleResetFilters}
                      className="inline-flex items-center gap-1 rounded-[4px] border border-[#F4F1EA]/[0.14] px-2.5 py-1 text-xs text-ivory hover:border-[#D99B26] hover:text-[#D99B26]"
                    >
                      <ResetIcon className="h-3.5 w-3.5" />
                      초기화
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setFilterDrawerOpen(false)}
                    className="rounded-[4px] px-2.5 py-1 text-xs text-silver hover:text-ivory"
                  >
                    접기
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}
      </header>

      {/* Full-Bleed Visual Masonry Wall (PRESERVED 100% UNCHANGED) */}
      <main className="mx-auto w-full max-w-[2560px] flex-1 px-3 py-3 sm:px-5 lg:px-7">
        {/* Shared Moodboard Restoration Banner */}
        {initialBoardIds.length > 0 && !sharedBannerDismissed && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-[4px] border border-[#D99B26]/40 bg-[#D99B26]/10 px-4 py-2.5 text-sm">
            <div className="flex items-center gap-2 text-ivory">
              <BoardBookmarkIcon className="h-4 w-4 text-[#D99B26]" filled />
              <span>
                공유 링크(<code className="font-mono text-[#D99B26]">?board=</code>)에서{" "}
                <strong>{initialBoardIds.length}개</strong>의 레퍼런스 보관함이 복원되었습니다.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setFilterState((prev) => ({
                    ...prev,
                    boardOnly: !prev.boardOnly,
                  }))
                }
                className="rounded-[4px] border border-[#D99B26]/50 bg-[#09090B] px-3 py-1 font-mono text-xs text-[#D99B26] hover:bg-[#D99B26] hover:text-[#09090B]"
              >
                {filterState.boardOnly ? "전체 아카이브 보기" : "보관함 컷만 모아보기"}
              </button>
              <button
                type="button"
                onClick={() => setBoardOpen(true)}
                className="rounded-[4px] bg-[#D99B26] px-3 py-1 font-mono text-xs font-semibold text-[#09090B]"
              >
                보관함 열기
              </button>
              <button
                type="button"
                onClick={() => setSharedBannerDismissed(true)}
                aria-label="알림 닫기"
                className="p-1 text-silver hover:text-ivory"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Active Filter Micro-Chips Bar */}
        {hasActiveFilters && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-xs text-silver">
                <strong className="text-ivory">{filteredItems.length}</strong> /{" "}
                {items.length}
              </span>

              {filterState.boardOnly && (
                <button
                  type="button"
                  onClick={() =>
                    setFilterState((prev) => ({ ...prev, boardOnly: false }))
                  }
                  className="inline-flex items-center gap-1 rounded-[4px] border border-[#D99B26]/50 bg-[#D99B26]/15 px-2.5 py-1 font-mono text-xs text-[#D99B26]"
                >
                  보관함만 보기
                  <CloseIcon className="h-3 w-3" />
                </button>
              )}

              {filterState.mediaType !== "ALL" && (
                <button
                  type="button"
                  onClick={() =>
                    setFilterState((prev) => ({ ...prev, mediaType: "ALL" }))
                  }
                  className="inline-flex items-center gap-1 rounded-[4px] border border-[#F4F1EA]/15 bg-[#111216] px-2.5 py-1 font-mono text-xs text-ivory"
                >
                  {filterState.mediaType}
                  <CloseIcon className="h-3 w-3 text-silver" />
                </button>
              )}

              {filterState.era !== "ALL" && (
                <button
                  type="button"
                  onClick={() =>
                    setFilterState((prev) => ({ ...prev, era: "ALL" }))
                  }
                  className="inline-flex items-center gap-1 rounded-[4px] border border-[#F4F1EA]/15 bg-[#111216] px-2.5 py-1 font-mono text-xs text-ivory"
                >
                  {filterState.era}
                  <CloseIcon className="h-3 w-3 text-silver" />
                </button>
              )}

              {filterState.compositionTags.map((tag) => (
                <button
                  key={`active-c-${tag}`}
                  type="button"
                  onClick={() => handleToggleComposition(tag)}
                  className="inline-flex items-center gap-1 rounded-[4px] border border-ivory/40 bg-ivory/15 px-2.5 py-1 text-xs text-ivory"
                >
                  {tag}
                  <CloseIcon className="h-3 w-3" />
                </button>
              ))}

              {filterState.persuasionTags.map((tag) => (
                <button
                  key={`active-p-${tag}`}
                  type="button"
                  onClick={() => handleTogglePersuasion(tag)}
                  className="inline-flex items-center gap-1 rounded-[4px] border border-[#D99B26]/50 bg-[#D99B26]/15 px-2.5 py-1 text-xs text-[#D99B26]"
                >
                  {tag}
                  <CloseIcon className="h-3 w-3" />
                </button>
              ))}

              {filterState.query.trim() && (
                <button
                  type="button"
                  onClick={() =>
                    setFilterState((prev) => ({ ...prev, query: "" }))
                  }
                  className="inline-flex items-center gap-1 rounded-[4px] border border-[#F4F1EA]/15 bg-[#111216] px-2.5 py-1 font-mono text-xs text-ivory"
                >
                  &ldquo;{filterState.query.trim()}&rdquo;
                  <CloseIcon className="h-3 w-3 text-silver" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1 rounded-[4px] border border-[#F4F1EA]/[0.14] bg-[#111216] px-3 py-1 font-mono text-xs text-ivory transition-colors hover:border-[#D99B26] hover:text-[#D99B26]"
            >
              <ResetIcon className="h-3.5 w-3.5" />
              초기화
            </button>
          </div>
        )}

        {/* True Multi-Column Full-Bleed Masonry Wall (LOCKED) */}
        {filteredItems.length > 0 ? (
          <section
            aria-label="큐레이션 아카이브 그리드"
            className="columns-1 gap-3 sm:columns-2 md:columns-3 lg:columns-4 xl:columns-5 2xl:columns-6"
          >
            {filteredItems.map((item) => (
              <SlideMountCard
                key={item.id}
                item={item}
                isInBoard={filterState.boardIds.includes(item.id)}
                isInCompare={compareIds.includes(item.id)}
                compareFull={compareIds.length >= 2}
                onOpenDetail={(target) => setSelectedItemId(target.id)}
                onToggleBoard={handleToggleBoard}
                onToggleCompare={handleToggleCompare}
              />
            ))}
          </section>
        ) : (
          <section className="flex flex-col items-center justify-center rounded-[4px] border border-[#F4F1EA]/[0.08] bg-[#111216] px-6 py-20 text-center">
            <p className="font-mono text-xs uppercase tracking-widest text-[#D99B26]">
              NO MATCHING FRAMES
            </p>
            <h2 className="mt-2 text-lg font-semibold text-ivory">
              선택한 교차 필터 조건에 일치하는 아카이브 프레임이 없습니다
            </h2>
            <p className="mt-1.5 text-sm text-silver">
              일부 구도·설득 태그를 해제하거나 전체 필터를 초기화해 모든 검증 프레임을 확인하세요.
            </p>
            <button
              type="button"
              onClick={handleResetFilters}
              className="mt-4 inline-flex items-center gap-1.5 rounded-[4px] bg-[#D99B26] px-4 py-2 font-mono text-xs font-semibold text-[#09090B] hover:bg-amber-glow"
            >
              <ResetIcon className="h-3.5 w-3.5" />
              모든 필터 초기화
            </button>
          </section>
        )}
      </main>

      {/* Minimal Darkroom Footer */}
      <footer className="mt-8 border-t border-[#F4F1EA]/[0.07] bg-[#09090B] py-4">
        <div className="mx-auto flex w-full max-w-[2560px] flex-col items-start justify-between gap-2 px-3 font-mono text-xs text-silver/75 sm:flex-row sm:items-center sm:px-5 lg:px-7">
          <span>
            KINOFRAME · 35MM DARKROOM VISUAL ARCHIVE · {items.length} VERIFIED FRAMES
          </span>
          <span>
            Internet Archive (Prelinger / Newsreels) · NASA Images · Wikimedia Commons / LOC · YouTube Official Embed
          </span>
        </div>
      </footer>

      {/* Floating Bottom Compare Dock */}
      {compareIds.length > 0 && !compareOpen && (
        <div className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border border-[#D99B26]/55 bg-[#111216]/95 px-4 py-2 shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-2 font-mono text-xs text-ivory">
            <CompareIcon className="h-4 w-4 text-[#D99B26]" />
            <span>
              비교 슬롯{" "}
              <strong className="text-[#D99B26]">{compareIds.join(" × ")}</strong>
            </span>
          </div>
          <button
            type="button"
            onClick={() => setCompareOpen(true)}
            className="rounded-full bg-[#D99B26] px-3 py-1 font-mono text-xs font-semibold text-[#09090B] hover:bg-amber-glow"
          >
            비교 열기
          </button>
          <button
            type="button"
            onClick={() => setCompareIds([])}
            aria-label="비교 슬롯 비우기"
            className="text-silver hover:text-ivory"
          >
            <CloseIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Enlarged 3-Tab Frame Set Lightbox Modal */}
      {selectedItem && (
        <ViewfinderModal
          item={selectedItem}
          allItems={items}
          hasPrev={selectedIndex > 0}
          hasNext={
            selectedIndex >= 0 && selectedIndex < filteredItems.length - 1
          }
          isInBoard={filterState.boardIds.includes(selectedItem.id)}
          isInCompare={compareIds.includes(selectedItem.id)}
          compareFull={compareIds.length >= 2}
          folders={vault.folders}
          existingBookmark={selectedBookmark}
          onClose={() => setSelectedItemId(null)}
          onPrev={() => {
            if (selectedIndex > 0) {
              setSelectedItemId(filteredItems[selectedIndex - 1].id);
            }
          }}
          onNext={() => {
            if (
              selectedIndex >= 0 &&
              selectedIndex < filteredItems.length - 1
            ) {
              setSelectedItemId(filteredItems[selectedIndex + 1].id);
            }
          }}
          onSelectItem={(target) => setSelectedItemId(target.id)}
          onToggleBoard={handleToggleBoard}
          onToggleCompare={handleToggleCompare}
          onSaveToVault={handleSaveToVault}
          onCreateFolder={handleCreateFolder}
          onSelectCompositionTag={handleApplyCompositionFromModal}
          onSelectPersuasionTag={handleApplyPersuasionFromModal}
        />
      )}

      {/* Side-by-Side Compare Modal */}
      {compareOpen && (
        <CompareDrawer
          allItems={items}
          compareIds={compareIds}
          onClose={() => setCompareOpen(false)}
          onReplaceSlot={handleReplaceCompareSlot}
          onClearCompare={() => setCompareIds([])}
        />
      )}

      {/* Archive Vault & URL-Shared Moodboard Drawer */}
      {boardOpen && (
        <MoodboardDrawer
          items={boardItems}
          vault={vault}
          session={session}
          boardOnly={filterState.boardOnly}
          onClose={() => setBoardOpen(false)}
          onRemoveItem={handleToggleBoard}
          onClearBoard={handleClearBoard}
          onToggleBoardOnly={() =>
            setFilterState((prev) => ({
              ...prev,
              boardOnly: !prev.boardOnly,
            }))
          }
          onOpenDetail={(target) => setSelectedItemId(target.id)}
          onExportBackup={handleExportBackup}
          onImportBackupFile={handleImportBackupFile}
          onOpenAuth={() => {
            setBoardOpen(false);
            setAuthOpen(true);
          }}
        />
      )}

      {/* Google / Naver OAuth & Local Backup Modal */}
      {authOpen && (
        <AuthModal
          session={session}
          onClose={() => setAuthOpen(false)}
          onLogout={handleLogout}
          onExportBackup={handleExportBackup}
          onImportBackupFile={handleImportBackupFile}
        />
      )}
    </div>
  );
}
