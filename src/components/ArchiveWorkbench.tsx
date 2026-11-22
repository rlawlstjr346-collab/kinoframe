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
  MediaMode,
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
  MEDIA_MODES,
  filterAndSortArchive,
  getVisibleArchiveSlice,
  parseBoardIds,
  rotateArchiveWithSeed,
  serializeBoardIds,
} from "@/lib/taxonomy";
import {
  DEFAULT_VAULT_STATE,
  exportVaultToFile,
  isConduitItemId,
  loadAccountVault,
  loadConduitSavedItems,
  parseImportedVaultJson,
  removeConduitSavedItem,
  saveAccountVault,
  saveConduitSavedItem,
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
  COUNTRIES;

export function ArchiveWorkbench({ items }: ArchiveWorkbenchProps) {
  const searchParams = useSearchParams();
  const [savedConduitItems, setSavedConduitItems] = useState<ArchiveItem[]>([]);
  const [conduitItems, setConduitItems] = useState<ArchiveItem[]>([]);
  const [conduitCursor, setConduitCursor] = useState<number>(1);
  const [conduitLoading, setConduitLoading] = useState<boolean>(false);
  const [conduitHasMore, setConduitHasMore] = useState<boolean>(true);
  const conduitInFlightRef = useRef<boolean>(false);

  const allCatalogItems = useMemo(() => {
    const map = new Map<string, ArchiveItem>();
    const seenSources = new Set<string>();
    const seenVideos = new Set<string>();
    const appendUnique = (entry: ArchiveItem) => {
      if (map.has(entry.id) || seenSources.has(entry.sourceUrl)) return;
      if (entry.previewVideoUrl && seenVideos.has(entry.previewVideoUrl)) return;
      map.set(entry.id, entry);
      seenSources.add(entry.sourceUrl);
      if (entry.previewVideoUrl) seenVideos.add(entry.previewVideoUrl);
    };
    for (const entry of items) appendUnique(entry);
    for (const entry of savedConduitItems) appendUnique(entry);
    for (const entry of conduitItems) appendUnique(entry);
    return Array.from(map.values());
  }, [items, savedConduitItems, conduitItems]);

  const validIdSet = useMemo(
    () => new Set(allCatalogItems.map((i) => i.id)),
    [allCatalogItems]
  );

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
        .filter((id) => validIdSet.has(id) || isConduitItemId(id));

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

  // Visit seed, saved conduit items hydration & initial session hydration
  useEffect(() => {
    const persistedConduit = loadConduitSavedItems();
    if (persistedConduit.length > 0) {
      setSavedConduitItems(persistedConduit);
    }

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

  const activeConduitFilterKey = useMemo(
    () =>
      [
        filterState.category ?? "ALL",
        filterState.country ?? "ALL",
        filterState.era,
        filterState.mediaMode ?? "ALL",
        filterState.query.trim().toLowerCase(),
        shuffleSeed ?? 1,
      ].join("|"),
    [
      filterState.category,
      filterState.country,
      filterState.era,
      filterState.mediaMode,
      filterState.query,
      shuffleSeed,
    ]
  );

  const activeConduitKeyRef = useRef<string>(activeConduitFilterKey);
  activeConduitKeyRef.current = activeConduitFilterKey;

  const filteredLocalItems = useMemo(() => {
    const base = filterAndSortArchive(items, filterState);
    if (filterState.sort === "smart_mix" && shuffleSeed !== null) {
      return rotateArchiveWithSeed(base, shuffleSeed);
    }
    return base;
  }, [items, filterState, shuffleSeed]);

  const filteredItems = useMemo(() => {
    const seenIds = new Set(filteredLocalItems.map((i) => i.id));
    const seenSources = new Set(filteredLocalItems.map((i) => i.sourceUrl));
    const seenVideos = new Set(
      filteredLocalItems
        .map((i) => i.previewVideoUrl)
        .filter((u): u is string => Boolean(u))
    );

    const extraCandidates: ArchiveItem[] = [];
    const appendCandidate = (entry: ArchiveItem) => {
      if (seenIds.has(entry.id) || seenSources.has(entry.sourceUrl)) return;
      if (entry.previewVideoUrl && seenVideos.has(entry.previewVideoUrl)) return;
      seenIds.add(entry.id);
      seenSources.add(entry.sourceUrl);
      if (entry.previewVideoUrl) seenVideos.add(entry.previewVideoUrl);
      extraCandidates.push(entry);
    };

    if (filterState.boardOnly) {
      for (const entry of savedConduitItems) appendCandidate(entry);
      const filteredSaved = filterAndSortArchive(extraCandidates, filterState);
      return [...filteredLocalItems, ...filteredSaved];
    }

    for (const entry of conduitItems) appendCandidate(entry);
    if (extraCandidates.length === 0) return filteredLocalItems;

    // Respect active mediaMode & category on streamed conduit items while keeping broad search results fluid
    const activeMode = filterState.mediaMode ?? "ALL";
    const activeCat = filterState.category ?? "ALL";
    const refinedExtra = extraCandidates.filter((entry) => {
      if (
        activeMode === "MOTION" &&
        entry.mediaSource !== "archive_mp4" &&
        entry.mediaSource !== "youtube_embed"
      ) {
        return false;
      }
      if (activeMode === "STILL" && entry.mediaSource !== "still_image") {
        return false;
      }
      if (activeCat !== "ALL" && entry.category !== activeCat) {
        return false;
      }
      return true;
    });

    return [...filteredLocalItems, ...refinedExtra];
  }, [filteredLocalItems, conduitItems, savedConduitItems, filterState]);

  const visibleItems = useMemo(
    () => getVisibleArchiveSlice(filteredItems, visibleCount),
    [filteredItems, visibleCount]
  );

  const hasMoreItems = visibleItems.length < filteredItems.length;
  const canLoadConduit = !filterState.boardOnly && conduitHasMore;

  const fetchNextConduitPage = useCallback(async () => {
    if (
      conduitInFlightRef.current ||
      !conduitHasMore ||
      filterState.boardOnly ||
      shuffleSeed === null
    ) {
      return;
    }

    const requestKey = activeConduitKeyRef.current;
    conduitInFlightRef.current = true;
    setConduitLoading(true);

    try {
      const qs = new URLSearchParams({
        category: filterState.category ?? "ALL",
        country: filterState.country ?? "ALL",
        decade: filterState.era,
        mediaMode: filterState.mediaMode ?? "ALL",
        cursor: String(conduitCursor),
        seed: String(shuffleSeed),
      });
      if (filterState.query.trim()) {
        qs.set("q", filterState.query.trim());
      }

      const res = await fetch(`/api/archive/conduit?${qs.toString()}`, {
        cache: "default",
      });
      if (!res.ok) {
        setConduitHasMore(false);
        return;
      }

      const data = (await res.json()) as {
        items?: ArchiveItem[];
        nextCursor?: number | null;
        hasMore?: boolean;
      };

      // Discard stale responses if user changed filters mid-flight
      if (activeConduitKeyRef.current !== requestKey) return;

      const incoming = Array.isArray(data.items) ? data.items : [];
      if (incoming.length > 0) {
        setConduitItems((prev) => {
          const existingIds = new Set<string>([
            ...items.map((i) => i.id),
            ...prev.map((i) => i.id),
          ]);
          const existingSources = new Set<string>([
            ...items.map((i) => i.sourceUrl),
            ...prev.map((i) => i.sourceUrl),
          ]);
          const existingVideos = new Set<string>([
            ...items
              .map((i) => i.previewVideoUrl)
              .filter((u): u is string => Boolean(u)),
            ...prev
              .map((i) => i.previewVideoUrl)
              .filter((u): u is string => Boolean(u)),
          ]);

          const fresh: ArchiveItem[] = [];
          for (const entry of incoming) {
            if (
              existingIds.has(entry.id) ||
              existingSources.has(entry.sourceUrl)
            ) {
              continue;
            }
            if (
              entry.previewVideoUrl &&
              existingVideos.has(entry.previewVideoUrl)
            ) {
              continue;
            }
            existingIds.add(entry.id);
            existingSources.add(entry.sourceUrl);
            if (entry.previewVideoUrl) existingVideos.add(entry.previewVideoUrl);
            fresh.push(entry);
          }
          return fresh.length > 0 ? [...prev, ...fresh] : prev;
        });
      }

      if (data.hasMore && typeof data.nextCursor === "number") {
        setConduitCursor(data.nextCursor);
        setConduitHasMore(true);
      } else {
        setConduitHasMore(false);
      }
    } catch {
      // Quietly degrade to local seed without exposing errors
      setConduitHasMore(false);
    } finally {
      conduitInFlightRef.current = false;
      setConduitLoading(false);
    }
  }, [
    conduitCursor,
    conduitHasMore,
    filterState.boardOnly,
    filterState.category,
    filterState.country,
    filterState.era,
    filterState.mediaMode,
    filterState.query,
    items,
    shuffleSeed,
  ]);

  // Reset progressive render window & conduit cursor whenever active filters or shuffle seed change
  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_COUNT);
    setConduitItems([]);
    setConduitCursor(1);
    setConduitHasMore(true);
    conduitInFlightRef.current = false;
  }, [
    filterState.mediaMode,
    filterState.category,
    filterState.country,
    filterState.era,
    filterState.query,
    filterState.sort,
    filterState.boardOnly,
    shuffleSeed,
  ]);

  const hasActiveFilters =
    (filterState.mediaMode ?? "ALL") !== "ALL" ||
    (filterState.category ?? "ALL") !== "ALL" ||
    (filterState.country ?? "ALL") !== "ALL" ||
    filterState.era !== "ALL" ||
    filterState.query.trim().length > 0 ||
    filterState.boardOnly;

  // Auto-tap live external conduit when nearing end of local pool or sparse filter/search results
  useEffect(() => {
    if (!canLoadConduit || conduitLoading || shuffleSeed === null) return;
    const nearLocalEnd = visibleCount >= filteredItems.length - 18;
    const sparseFilterResults =
      hasActiveFilters && filteredItems.length < 18 && conduitCursor === 1;
    if (nearLocalEnd || sparseFilterResults) {
      fetchNextConduitPage();
    }
  }, [
    canLoadConduit,
    conduitLoading,
    conduitCursor,
    filteredItems.length,
    visibleCount,
    hasActiveFilters,
    shuffleSeed,
    fetchNextConduitPage,
  ]);

  // Pinterest-style infinite scroll sentinel (640px ahead of viewport bottom)
  useEffect(() => {
    if (!hasMoreItems && !canLoadConduit) return;
    const node = loadMoreSentinelRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCount((prev) => {
            const next = Math.min(filteredItems.length, prev + LOAD_MORE_STEP);
            if (next >= filteredItems.length - 18) {
              fetchNextConduitPage();
            }
            return next;
          });
        }
      },
      { rootMargin: "640px 0px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMoreItems, canLoadConduit, filteredItems.length, fetchNextConduitPage]);

  const boardItems = useMemo(() => {
    const map = new Map(allCatalogItems.map((i) => [i.id, i]));
    return filterState.boardIds
      .map((id) => map.get(id))
      .filter((x): x is ArchiveItem => Boolean(x));
  }, [allCatalogItems, filterState.boardIds]);

  const selectedIndex = useMemo(
    () =>
      selectedItemId
        ? filteredItems.findIndex((i) => i.id === selectedItemId)
        : -1,
    [filteredItems, selectedItemId]
  );

  const selectedItem = useMemo(() => {
    if (!selectedItemId) return null;
    return allCatalogItems.find((i) => i.id === selectedItemId) ?? null;
  }, [allCatalogItems, selectedItemId]);

  const selectedBookmark = useMemo(() => {
    if (!selectedItemId) return undefined;
    return vault.bookmarks.find((b) => b.itemId === selectedItemId);
  }, [vault.bookmarks, selectedItemId]);

  const handleShuffleWall = useCallback(() => {
    setFilterState((prev) => ({ ...prev, sort: "smart_mix" }));
    setShuffleSeed((prev) => (prev ?? 1) + Math.floor(Math.random() * 997) + 17);
  }, []);

  const performToggleBoard = useCallback(
    (id: string, folderId?: string) => {
      const targetItem = allCatalogItems.find((entry) => entry.id === id);

      setFilterState((prev) => {
        const exists = prev.boardIds.includes(id);
        const nextBoardIds = exists
          ? prev.boardIds.filter((b) => b !== id)
          : [...prev.boardIds, id];
        if (isConduitItemId(id)) {
          if (exists) {
            setSavedConduitItems(removeConduitSavedItem(id));
          } else if (targetItem) {
            setSavedConduitItems(saveConduitSavedItem(targetItem));
          }
        }
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
    [allCatalogItems]
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
      if (isConduitItemId(payload.itemId)) {
        const targetItem = allCatalogItems.find(
          (entry) => entry.id === payload.itemId
        );
        if (targetItem) {
          setSavedConduitItems(saveConduitSavedItem(targetItem));
        }
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
    [session.authenticated, allCatalogItems]
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
        {/* Row 1: Main Bar (Logo + 8 Categories + Large Search + My Boards + Account) */}
        <div className="mx-auto flex min-h-[68px] w-full max-w-[2560px] flex-wrap items-center justify-between gap-x-4 gap-y-2.5 px-4 py-3 sm:px-6 2xl:min-h-[76px] 2xl:px-10">
          {/* Left: Logo + Elite 9 Category Tabs (ALL + 8 Categories) */}
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

            <nav
              className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
                    className={`inline-flex h-10 shrink-0 items-center rounded-full px-3.5 text-[15px] font-semibold transition-colors 2xl:h-11 2xl:px-4 2xl:text-[16px] ${
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
            {/* Left: Media Mode Switch + Country Pills + Era */}
            <div className="flex flex-wrap items-center gap-1.5">
              <div
                role="group"
                aria-label="미디어 유형 필터"
                className="inline-flex h-9 items-center rounded-full border border-white/[0.12] bg-[#141519] p-0.5 2xl:h-10"
              >
                {MEDIA_MODES.map((mode) => {
                  const active = (filterState.mediaMode ?? "ALL") === mode.value;
                  return (
                    <button
                      key={mode.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        setFilterState((prev) => ({
                          ...prev,
                          mediaMode: mode.value as MediaMode,
                        }))
                      }
                      className={`inline-flex h-8 items-center rounded-full px-3.5 text-[14px] font-medium transition-colors 2xl:h-9 2xl:px-4 2xl:text-[15px] ${
                        active
                          ? "bg-[#FAF8F5] font-semibold text-[#09090B]"
                          : "text-[#DFDAD0] hover:text-white"
                      }`}
                    >
                      {mode.label}
                    </button>
                  );
                })}
              </div>

              <span className="mx-1 h-4 w-px bg-white/15" aria-hidden="true" />

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

      {/* Full-Bleed Visual Masonry Wall (Eyecandy Ultra-Tight Contact Sheet) */}
      <main className="mx-auto w-full max-w-[2560px] flex-1 px-2 py-2 sm:px-3 lg:px-4">
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

        {/* True Multi-Column Full-Bleed Masonry Wall */}
        {filteredItems.length > 0 ? (
          <>
            <section
              aria-label="큐레이션 아카이브 그리드"
              className="columns-1 gap-1.5 sm:columns-2 md:columns-3 lg:columns-4 xl:columns-5 2xl:columns-6"
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

            {/* Infinite Scroll Sentinel, Live Conduit Status & Accessible Load-More Fallback */}
            {(hasMoreItems || canLoadConduit) && (
              <div
                ref={loadMoreSentinelRef}
                className="mt-4 flex flex-col items-center justify-center gap-2 py-3"
              >
                {conduitLoading ? (
                  <div
                    role="status"
                    aria-live="polite"
                    className="inline-flex h-9 items-center gap-2 rounded-full border border-white/[0.1] bg-[#141519]/90 px-4 font-mono text-[12px] tracking-wide text-[#D0CBC0]"
                  >
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#E5A93B]" />
                    <span>외부 아카이브 수맥 연결 중</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (hasMoreItems) {
                        setVisibleCount((prev) =>
                          Math.min(filteredItems.length, prev + LOAD_MORE_STEP)
                        );
                      } else {
                        fetchNextConduitPage();
                      }
                    }}
                    className="inline-flex h-10 items-center gap-2 rounded-full border border-white/[0.16] bg-[#141519] px-6 text-[14px] font-semibold text-[#FAF8F5] transition-colors hover:border-[#E5A93B] hover:text-[#E5A93B]"
                  >
                    <span>더 보기</span>
                  </button>
                )}
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
          <span>KINOFRAME · VISUAL ARCHIVE</span>
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
          allItems={allCatalogItems}
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
          allItems={allCatalogItems}
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
