"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type {
  ArchiveCategory,
  ArchiveItem,
  AuthSessionState,
  CountryCode,
  Era,
  FilterState,
  SortOption,
  VaultState,
} from "@/types/archive";
import {
  ARCHIVE_CATEGORIES,
  COUNTRIES,
  DEFAULT_FILTER_STATE,
  ERAS,
  INITIAL_VISIBLE_COUNT,
  LOAD_MORE_STEP,
  computeCurationDensityScore,
  filterAndSortArchive,
  getVisibleArchiveSlice,
  parseBoardIds,
  resolveItemCategory,
  rotateArchiveWithSeed,
  serializeBoardIds,
} from "@/lib/taxonomy";
import {
  DEFAULT_VAULT_STATE,
  exportVaultToFile,
  loadAccountVault,
  parseImportedVaultJson,
  saveAccountVault,
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

const HEADER_SORT_OPTIONS: Array<{ value: SortOption; label: string }> = [
  { value: "smart_mix", label: "스마트 믹스" },
  { value: "year_asc", label: "연대 오래된순" },
  { value: "year_desc", label: "연대 최신순" },
];

const COUNTRY_TABS: Array<{ value: CountryCode | "ALL"; label: string }> =
  COUNTRIES.filter((c) => c.value !== "GLOBAL");

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

  const [shuffleSeed, setShuffleSeed] = useState<number | null>(null);
  const [visibleCount, setVisibleCount] = useState<number>(INITIAL_VISIBLE_COUNT);
  const [genreMenuOpen, setGenreMenuOpen] = useState<boolean>(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [compareOpen, setCompareOpen] = useState<boolean>(false);
  const [boardOpen, setBoardOpen] = useState<boolean>(false);
  const [authOpen, setAuthOpen] = useState<boolean>(false);
  const [pendingSave, setPendingSave] = useState<{
    itemId: string;
    folderId?: string;
  } | null>(null);
  const [sharedBannerDismissed, setSharedBannerDismissed] =
    useState<boolean>(false);

  const catNavRef = useRef<HTMLElement | null>(null);
  const genreMenuRef = useRef<HTMLDivElement | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);

  // Account-isolated vault & session states
  const [vault, setVault] = useState<VaultState>(DEFAULT_VAULT_STATE);
  const [loadedAccountSub, setLoadedAccountSub] = useState<string | null>(null);
  const [session, setSession] = useState<AuthSessionState>({
    authenticated: false,
    user: null,
    cloudSyncAvailable: false,
  });

  const hydrateAccountVault = useCallback(
    async (userSub: string) => {
      const localAcc = loadAccountVault(userSub);
      let resolved = localAcc;

      try {
        const res = await fetch("/api/vault", { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as { vault?: VaultState | null };
          if (data.vault && Array.isArray(data.vault.folders)) {
            resolved = data.vault;
            saveAccountVault(userSub, resolved);
          }
        }
      } catch {
        // use account-scoped local storage
      }

      setVault(resolved);
      setLoadedAccountSub(userSub);

      const accountBoardIds = resolved.bookmarks
        .map((b) => b.itemId)
        .filter((id) => validIdSet.has(id));

      setFilterState((prev) => ({
        ...prev,
        boardIds:
          initialBoardIds.length > 0
            ? Array.from(new Set([...accountBoardIds, ...initialBoardIds]))
            : accountBoardIds,
      }));
    },
    [initialBoardIds, validIdSet]
  );

  // Visit seed & initial session hydration
  useEffect(() => {
    const visitSeed =
      Math.floor(Date.now() % 1_000_000) + Math.floor(Math.random() * 9973) + 1;
    setShuffleSeed(visitSeed);

    let cancelled = false;
    fetch("/api/auth/session", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: AuthSessionState) => {
        if (cancelled) return;
        setSession(data);
        if (data.authenticated && data.user) {
          hydrateAccountVault(data.user.sub);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [hydrateAccountVault]);

  // Persist account-isolated vault whenever changed by the signed-in account
  useEffect(() => {
    const activeSub = session.authenticated ? session.user?.sub ?? null : null;
    if (!activeSub || loadedAccountSub !== activeSub) return;

    saveAccountVault(activeSub, vault);
    fetch("/api/vault", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vault }),
    }).catch(() => {});
  }, [vault, session.authenticated, session.user?.sub, loadedAccountSub]);

  // Sync URL ?board= parameter cleanly without reload
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

  const visibleItems = useMemo(
    () => getVisibleArchiveSlice(filteredItems, visibleCount),
    [filteredItems, visibleCount]
  );

  const hasMoreItems = visibleItems.length < filteredItems.length;

  // Reset progressive render window whenever active filters or shuffle seed change
  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_COUNT);
  }, [
    filterState.category,
    filterState.country,
    filterState.era,
    filterState.query,
    filterState.sort,
    filterState.boardOnly,
    shuffleSeed,
  ]);

  // Pinterest-style infinite scroll sentinel (640px ahead of viewport bottom)
  useEffect(() => {
    if (!hasMoreItems) return;
    const node = loadMoreSentinelRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCount((prev) =>
            Math.min(filteredItems.length, prev + LOAD_MORE_STEP)
          );
        }
      },
      { rootMargin: "640px 0px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMoreItems, filteredItems.length]);

  // Close [전체 장르 12] popover on outside click or Escape
  useEffect(() => {
    if (!genreMenuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setGenreMenuOpen(false);
    };
    const onMouseDown = (e: MouseEvent) => {
      if (
        genreMenuRef.current &&
        !genreMenuRef.current.contains(e.target as Node)
      ) {
        setGenreMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onMouseDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onMouseDown);
    };
  }, [genreMenuOpen]);

  // Precompute 12-genre counts + highest-density representative thumbnail
  const genreMatrix = useMemo(() => {
    const grouped = new Map<ArchiveCategory, ArchiveItem[]>();
    for (const item of items) {
      const cat = resolveItemCategory(item);
      const list = grouped.get(cat);
      if (list) list.push(item);
      else grouped.set(cat, [item]);
    }
    return ARCHIVE_CATEGORIES.filter(
      (c): c is { value: ArchiveCategory; label: string; desc?: string } =>
        c.value !== "ALL"
    ).map((cat) => {
      const list = grouped.get(cat.value) ?? [];
      let cover = list[0];
      let bestScore = Number.NEGATIVE_INFINITY;
      for (const candidate of list) {
        const s = computeCurationDensityScore(candidate);
        if (s > bestScore) {
          bestScore = s;
          cover = candidate;
        }
      }
      return {
        value: cat.value,
        label: cat.label,
        desc: cat.desc ?? "",
        count: list.length,
        coverUrl: cover?.thumbnailUrl ?? "",
      };
    });
  }, [items]);

  const handleScrollCategories = useCallback((direction: -1 | 1) => {
    catNavRef.current?.scrollBy({
      left: direction * 340,
      behavior: "smooth",
    });
  }, []);

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

  const hasActiveFilters =
    (filterState.category ?? "ALL") !== "ALL" ||
    (filterState.country ?? "ALL") !== "ALL" ||
    filterState.era !== "ALL" ||
    filterState.query.trim().length > 0 ||
    filterState.boardOnly;

  const handleShuffleWall = useCallback(() => {
    setFilterState((prev) => ({ ...prev, sort: "smart_mix" }));
    setShuffleSeed((prev) => (prev ?? 1) + Math.floor(Math.random() * 997) + 17);
  }, []);

  const performToggleBoard = useCallback(
    (id: string, folderId?: string) => {
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
              folderId: folderId || prev.folders[0]?.id || "jp-vintage-cf",
              timestampSec: null,
              memo: "",
              savedAt: new Date().toISOString(),
            },
          ],
        };
      });
    },
    []
  );

  // Pinterest gate: guests clicking [저장] open login modal; logged-in users save immediately
  const handleToggleBoard = useCallback(
    (id: string, folderId?: string) => {
      if (!session.authenticated) {
        setPendingSave({ itemId: id, folderId });
        setAuthOpen(true);
        return;
      }
      performToggleBoard(id, folderId);
    },
    [session.authenticated, performToggleBoard]
  );

  const handleSaveToVault = useCallback(
    (payload: {
      itemId: string;
      folderId: string;
      timestampSec: number | null;
      memo: string;
    }) => {
      if (!session.authenticated) {
        setPendingSave({ itemId: payload.itemId, folderId: payload.folderId });
        setAuthOpen(true);
        return;
      }
      setVault((prev) => {
        const filtered = prev.bookmarks.filter(
          (b) => b.itemId !== payload.itemId
        );
        return {
          ...prev,
          bookmarks: [
            ...filtered,
            { ...payload, savedAt: new Date().toISOString() },
          ],
        };
      });
      setFilterState((prev) =>
        prev.boardIds.includes(payload.itemId)
          ? prev
          : { ...prev, boardIds: [...prev.boardIds, payload.itemId] }
      );
    },
    [session.authenticated]
  );

  const handleCreateFolder = useCallback((name: string): string => {
    const id = `board-${Date.now().toString(36)}`;
    setVault((prev) => ({
      ...prev,
      folders: [...prev.folders, { id, name }],
    }));
    return id;
  }, []);

  const handleRenameFolder = useCallback((folderId: string, newName: string) => {
    setVault((prev) => ({
      ...prev,
      folders: prev.folders.map((f) =>
        f.id === folderId ? { ...f, name: newName } : f
      ),
    }));
  }, []);

  const handleDeleteFolder = useCallback((folderId: string) => {
    setVault((prev) => {
      const nextFolders = prev.folders.filter((f) => f.id !== folderId);
      if (nextFolders.length === 0) return prev;
      const fallbackId = nextFolders[0].id;
      return {
        folders: nextFolders,
        bookmarks: prev.bookmarks.map((b) =>
          b.folderId === folderId ? { ...b, folderId: fallbackId } : b
        ),
      };
    });
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
      if (prev.includes(id)) return prev.filter((c) => c !== id);
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
        setFilterState((prev) => ({
          ...prev,
          boardIds: Array.from(new Set([...prev.boardIds, ...parsed.boardIds])),
        }));
      };
      reader.readAsText(file);
    },
    [validIdSet]
  );

  const handleAuthSuccess = useCallback(
    async (nextSession: AuthSessionState) => {
      setSession(nextSession);
      if (nextSession.authenticated && nextSession.user) {
        await hydrateAccountVault(nextSession.user.sub);
        if (pendingSave) {
          performToggleBoard(pendingSave.itemId, pendingSave.folderId);
          setPendingSave(null);
        }
      }
    },
    [hydrateAccountVault, pendingSave, performToggleBoard]
  );

  const handleLogout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setSession({
      authenticated: false,
      user: null,
      cloudSyncAvailable: false,
    });
    setLoadedAccountSub(null);
    setVault(DEFAULT_VAULT_STATE);
    setFilterState((prev) => ({
      ...prev,
      boardIds: [],
      boardOnly: false,
    }));
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-[#09090B]">
      {/* QHD / 4K Large-Scale 2-Row Sticky Archive Header */}
      <header className="sticky top-0 z-30 border-b border-white/[0.08] bg-[#09090B]/92 backdrop-blur-md">
        {/* Row 1: Main Bar (Logo + 7 Categories + Large Search + My Boards + Account) */}
        <div className="mx-auto flex min-h-[68px] w-full max-w-[2560px] flex-wrap items-center justify-between gap-x-4 gap-y-2.5 px-4 py-3 sm:px-6 2xl:min-h-[76px] 2xl:px-10">
          {/* Left: Logo + 12 Category Tabs with Scroll Arrows & Visual Genre Matrix */}
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              type="button"
              onClick={handleResetFilters}
              className="flex shrink-0 items-center gap-2.5 text-left"
              aria-label="KINOFRAME 홈 및 필터 초기화"
            >
              <KinoframeLogo className="h-8 w-8 shrink-0 2xl:h-9 2xl:w-9" />
              <span className="font-mono text-[19px] font-bold tracking-[0.16em] text-[#FAF8F5] 2xl:text-[22px]">
                KINOFRAME
              </span>
            </button>

            <div className="flex min-w-0 flex-1 items-center gap-1">
              <button
                type="button"
                onClick={() => handleScrollCategories(-1)}
                aria-label="이전 카테고리 보기"
                className="inline-flex h-9 w-8 shrink-0 items-center justify-center rounded-full border border-white/[0.12] bg-[#141519] text-[15px] font-semibold text-[#E5E0D5] transition-colors hover:border-[#E5A93B] hover:text-[#E5A93B]"
              >
                ‹
              </button>

              <nav
                ref={catNavRef}
                className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                role="tablist"
                aria-label="비주얼 카테고리"
              >
                {ARCHIVE_CATEGORIES.map((cat) => {
                  const active = (filterState.category ?? "ALL") === cat.value;
                  return (
                    <button
                      key={cat.value}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() =>
                        setFilterState((prev) => ({
                          ...prev,
                          category: cat.value as ArchiveCategory | "ALL",
                        }))
                      }
                      className={`inline-flex h-10 shrink-0 items-center rounded-full px-4 text-[15px] font-semibold transition-colors 2xl:h-11 2xl:px-5 2xl:text-[17px] ${
                        active
                          ? "bg-[#FAF8F5] text-[#09090B]"
                          : "text-[#E5E0D5] hover:bg-white/[0.08] hover:text-white"
                      }`}
                    >
                      {cat.label}
                    </button>
                  );
                })}
              </nav>

              <button
                type="button"
                onClick={() => handleScrollCategories(1)}
                aria-label="다음 카테고리 보기"
                className="inline-flex h-9 w-8 shrink-0 items-center justify-center rounded-full border border-white/[0.12] bg-[#141519] text-[15px] font-semibold text-[#E5E0D5] transition-colors hover:border-[#E5A93B] hover:text-[#E5A93B]"
              >
                ›
              </button>
            </div>

            {/* Visual 12-Genre Matrix Popover Trigger */}
            <div ref={genreMenuRef} className="relative shrink-0">
              <button
                type="button"
                onClick={() => setGenreMenuOpen((prev) => !prev)}
                aria-expanded={genreMenuOpen}
                aria-haspopup="dialog"
                className={`inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-[14px] font-semibold transition-colors 2xl:h-11 2xl:text-[16px] ${
                  genreMenuOpen
                    ? "border-[#E5A93B] bg-[#E5A93B] text-[#09090B]"
                    : "border-white/[0.16] bg-[#141519] text-[#FAF8F5] hover:border-[#E5A93B] hover:text-[#E5A93B]"
                }`}
              >
                <span>전체 장르</span>
                <span className="font-mono text-[13px] opacity-85">12</span>
              </button>

              {genreMenuOpen && (
                <div
                  role="dialog"
                  aria-label="12대 비주얼 장르 매트릭스"
                  className="fixed left-4 right-4 top-[78px] z-50 mx-auto max-w-[1160px] rounded-2xl border border-white/[0.14] bg-[#0D0E12]/98 p-5 shadow-2xl backdrop-blur-xl sm:left-6 sm:right-6"
                >
                  <div className="mb-4 flex items-center justify-between gap-3 border-b border-white/[0.08] pb-3">
                    <div>
                      <h2 className="text-[17px] font-bold text-[#FAF8F5]">
                        12대 비주얼 아카이브 장르
                      </h2>
                      <p className="text-[13px] text-[#C8C3B8]">
                        총 {items.length}컷 · 원하는 장르를 선택해 즉시 필터링하세요
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setFilterState((prev) => ({
                            ...prev,
                            category: "ALL",
                          }));
                          setGenreMenuOpen(false);
                        }}
                        className={`rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors ${
                          (filterState.category ?? "ALL") === "ALL"
                            ? "bg-[#FAF8F5] text-[#09090B]"
                            : "border border-white/[0.16] text-[#FAF8F5] hover:border-[#E5A93B]"
                        }`}
                      >
                        전체 보기 ({items.length}컷)
                      </button>
                      <button
                        type="button"
                        onClick={() => setGenreMenuOpen(false)}
                        aria-label="장르 매트릭스 닫기"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.12] text-[#D0CBC0] hover:text-white"
                      >
                        <CloseIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid max-h-[68vh] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4">
                    {genreMatrix.map((g) => {
                      const active = filterState.category === g.value;
                      return (
                        <button
                          key={g.value}
                          type="button"
                          onClick={() => {
                            setFilterState((prev) => ({
                              ...prev,
                              category: g.value,
                            }));
                            setGenreMenuOpen(false);
                          }}
                          className={`group relative overflow-hidden rounded-xl border text-left transition-all ${
                            active
                              ? "border-[#E5A93B] ring-1 ring-[#E5A93B]"
                              : "border-white/[0.1] hover:border-white/35"
                          }`}
                        >
                          <div className="relative aspect-[16/10] w-full overflow-hidden bg-[#14151A]">
                            {g.coverUrl && (
                              <img
                                src={g.coverUrl}
                                alt={g.label}
                                loading="lazy"
                                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                              />
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-[#09090B] via-[#09090B]/45 to-transparent" />
                            <span className="absolute right-2.5 top-2.5 rounded-full bg-[#09090B]/80 px-2.5 py-0.5 font-mono text-[12px] font-semibold text-[#FAF8F5]">
                              {g.count}컷
                            </span>
                            <div className="absolute bottom-2.5 left-3 right-3">
                              <div className="text-[15px] font-bold text-[#FAF8F5]">
                                {g.label}
                              </div>
                              <div className="truncate text-[12px] text-[#D8D3C8]">
                                {g.desc}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: Large Capsule Search + My Boards + Account */}
          <div className="flex shrink-0 items-center gap-2.5 sm:gap-3">
            <div className="relative w-56 xl:w-72 2xl:w-96">
              <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#B8B3A8]" />
              <input
                type="search"
                value={filterState.query}
                onChange={(e) =>
                  setFilterState((prev) => ({
                    ...prev,
                    query: e.target.value,
                  }))
                }
                placeholder="아카이브 검색..."
                aria-label="아카이브 검색"
                className="h-11 w-full rounded-full border border-white/[0.12] bg-[#141519] pl-11 pr-9 text-[15px] text-[#FAF8F5] placeholder:text-[#B8B3A8] focus:border-[#E5A93B] focus:outline-none 2xl:h-12 2xl:text-[17px]"
              />
              {filterState.query && (
                <button
                  type="button"
                  onClick={() =>
                    setFilterState((prev) => ({ ...prev, query: "" }))
                  }
                  aria-label="검색어 지우기"
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#B8B3A8] hover:text-white"
                >
                  <CloseIcon className="h-4 w-4" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setBoardOpen(true)}
              className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-5 text-[15px] font-semibold transition-colors 2xl:h-12 2xl:text-[17px] ${
                filterState.boardIds.length > 0
                  ? "bg-[#FAF8F5] text-[#09090B] hover:bg-white"
                  : "border border-white/[0.14] bg-[#141519] text-[#FAF8F5] hover:border-white/35"
              }`}
            >
              <BoardBookmarkIcon
                className="h-4 w-4"
                filled={filterState.boardIds.length > 0}
              />
              <span>내 보드</span>
              {filterState.boardIds.length > 0 && (
                <span className="font-mono text-[13px] font-bold">
                  {filterState.boardIds.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setAuthOpen(true)}
              className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-5 text-[15px] font-semibold transition-colors 2xl:h-12 2xl:text-[17px] ${
                session.authenticated && session.user
                  ? "border border-[#E5A93B]/50 bg-[#E5A93B]/15 text-[#FAF8F5] hover:bg-[#E5A93B]/25"
                  : "text-[#FAF8F5] hover:bg-white/[0.08]"
              }`}
            >
              {session.authenticated && session.user ? (
                <>
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#FAF8F5] text-[12px] font-bold text-[#09090B]">
                    {session.user.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span>{session.user.name}</span>
                </>
              ) : (
                <span>로그인</span>
              )}
            </button>
          </div>
        </div>

        {/* Row 2: Slim Sub-Filter Bar (Countries + Era + Shuffle + Sort) */}
        <div className="border-t border-white/[0.06] bg-[#09090B]/95">
          <div className="mx-auto flex w-full max-w-[2560px] flex-wrap items-center justify-between gap-2 px-4 py-2.5 sm:px-6 2xl:px-10">
            {/* Left: Country Pills + Era */}
            <div className="flex flex-wrap items-center gap-1.5">
              {COUNTRY_TABS.map((c) => {
                const active = (filterState.country ?? "ALL") === c.value;
                return (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() =>
                      setFilterState((prev) => ({
                        ...prev,
                        country: c.value as CountryCode | "ALL",
                      }))
                    }
                    className={`inline-flex h-9 items-center rounded-full px-4 text-[14px] font-medium transition-colors 2xl:h-10 2xl:text-[16px] ${
                      active
                        ? "bg-[#E5A93B] font-semibold text-[#09090B]"
                        : "text-[#DFDAD0] hover:bg-white/[0.08] hover:text-white"
                    }`}
                  >
                    {c.label}
                  </button>
                );
              })}

              <span className="mx-1 h-4 w-px bg-white/15" aria-hidden="true" />

              <select
                aria-label="제작 연대 선택"
                value={filterState.era}
                onChange={(e) =>
                  setFilterState((prev) => ({
                    ...prev,
                    era: e.target.value as Era | "ALL",
                  }))
                }
                className="h-9 rounded-full border border-white/[0.12] bg-[#141519] px-3.5 text-[14px] font-medium text-[#FAF8F5] focus:border-[#E5A93B] focus:outline-none 2xl:h-10 2xl:text-[16px]"
              >
                {ERAS.map((era) => (
                  <option key={era.value} value={era.value}>
                    {era.label}
                  </option>
                ))}
              </select>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/[0.14] px-3.5 text-[14px] font-medium text-[#FAF8F5] hover:border-[#E5A93B] hover:text-[#E5A93B] 2xl:h-10 2xl:text-[15px]"
                >
                  <ResetIcon className="h-3.5 w-3.5" />
                  <span>초기화</span>
                </button>
              )}
            </div>

            {/* Right: Shuffle + Sort */}
            <div className="flex items-center gap-2">
              <span className="hidden font-mono text-[13px] text-[#C8C3B8] sm:inline 2xl:text-[14px]">
                {filteredItems.length}컷
              </span>

              <button
                type="button"
                onClick={handleShuffleWall}
                className="inline-flex h-9 items-center rounded-full border border-white/[0.14] bg-[#141519] px-4 text-[14px] font-semibold text-[#FAF8F5] transition-colors hover:border-[#E5A93B] hover:text-[#E5A93B] 2xl:h-10 2xl:text-[16px]"
              >
                셔플 ↻
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
                className="h-9 rounded-full border border-white/[0.14] bg-[#141519] px-4 text-[14px] font-medium text-[#FAF8F5] focus:border-[#E5A93B] focus:outline-none 2xl:h-10 2xl:text-[16px]"
              >
                {HEADER_SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </header>

      {/* Full-Bleed Visual Masonry Wall (LOCKED UNCHANGED) */}
      <main className="mx-auto w-full max-w-[2560px] flex-1 px-3 py-3 sm:px-5 lg:px-7">
        {/* Shared ?board= Restoration Banner */}
        {initialBoardIds.length > 0 && !sharedBannerDismissed && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#E5A93B]/45 bg-[#E5A93B]/12 px-5 py-3 text-[15px]">
            <div className="flex items-center gap-2 text-[#FAF8F5]">
              <BoardBookmarkIcon className="h-4 w-4 text-[#E5A93B]" filled />
              <span>
                공유 보드 링크에서 <strong>{initialBoardIds.length}개</strong>의
                아카이브가 열렸습니다.
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
                className="rounded-full border border-[#E5A93B]/60 bg-[#09090B] px-3.5 py-1 text-[13px] font-semibold text-[#E5A93B]"
              >
                {filterState.boardOnly ? "전체 보기" : "공유 컷만 보기"}
              </button>
              <button
                type="button"
                onClick={() => setBoardOpen(true)}
                className="rounded-full bg-[#E5A93B] px-3.5 py-1 text-[13px] font-bold text-[#09090B]"
              >
                보드 열기
              </button>
              <button
                type="button"
                onClick={() => setSharedBannerDismissed(true)}
                aria-label="알림 닫기"
                className="p-1 text-[#D0CBC0] hover:text-white"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* True Multi-Column Full-Bleed Masonry Wall (LOCKED UNCHANGED) */}
        {filteredItems.length > 0 ? (
          <>
            <section
              aria-label="큐레이션 아카이브 그리드"
              className="columns-1 gap-3 sm:columns-2 md:columns-3 lg:columns-4 xl:columns-5 2xl:columns-6"
            >
              {visibleItems.map((item) => (
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

            {/* Infinite Scroll Sentinel & Accessible Load-More Fallback */}
            {hasMoreItems && (
              <div
                ref={loadMoreSentinelRef}
                className="mt-6 flex flex-col items-center justify-center gap-2 py-4"
              >
                <button
                  type="button"
                  onClick={() =>
                    setVisibleCount((prev) =>
                      Math.min(filteredItems.length, prev + LOAD_MORE_STEP)
                    )
                  }
                  className="inline-flex h-11 items-center gap-2 rounded-full border border-white/[0.16] bg-[#141519] px-7 text-[15px] font-semibold text-[#FAF8F5] transition-colors hover:border-[#E5A93B] hover:text-[#E5A93B]"
                >
                  <span>더 보기</span>
                  <span className="font-mono text-[13px] text-[#C8C3B8]">
                    ({visibleItems.length} / {filteredItems.length}컷)
                  </span>
                </button>
              </div>
            )}
          </>
        ) : (
          <section className="flex flex-col items-center justify-center rounded-xl border border-white/[0.08] bg-[#111216] px-6 py-24 text-center">
            <h2 className="text-[20px] font-bold text-[#FAF8F5]">
              선택한 조건에 일치하는 아카이브가 없습니다
            </h2>
            <p className="mt-2 text-[15px] text-[#D0CBC0]">
              다른 카테고리나 국가 필터를 선택하거나 전체 아카이브로 돌아가세요.
            </p>
            <button
              type="button"
              onClick={handleResetFilters}
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#FAF8F5] px-6 py-2.5 text-[15px] font-bold text-[#09090B] hover:bg-white"
            >
              <ResetIcon className="h-4 w-4" />
              전체 아카이브 보기
            </button>
          </section>
        )}
      </main>

      {/* Minimal Darkroom Footer */}
      <footer className="mt-8 border-t border-white/[0.07] bg-[#09090B] py-4">
        <div className="mx-auto flex w-full max-w-[2560px] flex-col items-start justify-between gap-2 px-4 font-mono text-[13px] text-[#B8B3A8] sm:flex-row sm:items-center sm:px-6 2xl:px-10">
          <span>KINOFRAME · VISUAL ARCHIVE · {items.length} VERIFIED ITEMS</span>
          <span>
            Internet Archive · Wikimedia Commons · NASA Images · YouTube Official Embed
          </span>
        </div>
      </footer>

      {/* Floating Bottom Compare Dock */}
      {compareIds.length > 0 && !compareOpen && (
        <div className="fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border border-[#E5A93B]/60 bg-[#111216]/95 px-5 py-2.5 shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-2 text-[14px] text-[#FAF8F5]">
            <CompareIcon className="h-4 w-4 text-[#E5A93B]" />
            <span>
              비교 선택{" "}
              <strong className="font-mono text-[#E5A93B]">
                {compareIds.join(" × ")}
              </strong>
            </span>
          </div>
          <button
            type="button"
            onClick={() => setCompareOpen(true)}
            className="rounded-full bg-[#FAF8F5] px-4 py-1 text-[13px] font-bold text-[#09090B] hover:bg-white"
          >
            좌우 비교 열기
          </button>
          <button
            type="button"
            onClick={() => setCompareIds([])}
            aria-label="비교 슬롯 비우기"
            className="text-[#D0CBC0] hover:text-white"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Pure Visual Full-Screen Detail Lightbox */}
      {selectedItem && (
        <ViewfinderModal
          item={selectedItem}
          allItems={items}
          hasPrev={selectedIndex > 0}
          hasNext={
            selectedIndex >= 0 && selectedIndex < filteredItems.length - 1
          }
          isAuthenticated={session.authenticated}
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
              const nextIdx = selectedIndex + 1;
              setSelectedItemId(filteredItems[nextIdx].id);
              if (nextIdx >= visibleCount) {
                setVisibleCount((prev) =>
                  Math.min(filteredItems.length, Math.max(prev, nextIdx + LOAD_MORE_STEP))
                );
              }
            }
          }}
          onSelectItem={(target) => setSelectedItemId(target.id)}
          onToggleBoard={handleToggleBoard}
          onToggleCompare={handleToggleCompare}
          onSaveToVault={handleSaveToVault}
        />
      )}

      {/* Side-by-Side Visual Compare Modal */}
      {compareOpen && (
        <CompareDrawer
          allItems={items}
          compareIds={compareIds}
          onClose={() => setCompareOpen(false)}
          onReplaceSlot={handleReplaceCompareSlot}
          onClearCompare={() => setCompareIds([])}
        />
      )}

      {/* Pinterest-Style Multi-Board Drawer */}
      {boardOpen && (
        <MoodboardDrawer
          items={boardItems}
          vault={vault}
          session={session}
          boardOnly={filterState.boardOnly}
          onClose={() => setBoardOpen(false)}
          onRemoveItem={(id) => performToggleBoard(id)}
          onClearBoard={handleClearBoard}
          onToggleBoardOnly={() =>
            setFilterState((prev) => ({
              ...prev,
              boardOnly: !prev.boardOnly,
            }))
          }
          onOpenDetail={(target) => setSelectedItemId(target.id)}
          onCreateFolder={handleCreateFolder}
          onRenameFolder={handleRenameFolder}
          onDeleteFolder={handleDeleteFolder}
          onExportBackup={handleExportBackup}
          onImportBackupFile={handleImportBackupFile}
          onOpenAuth={() => {
            setBoardOpen(false);
            setAuthOpen(true);
          }}
        />
      )}

      {/* Multi-Account Login / Register Modal */}
      {authOpen && (
        <AuthModal
          session={session}
          savedCount={filterState.boardIds.length}
          boardCount={vault.folders.length}
          onClose={() => {
            setAuthOpen(false);
            setPendingSave(null);
          }}
          onAuthSuccess={handleAuthSuccess}
          onLogout={handleLogout}
        />
      )}
    </div>
  );
}
