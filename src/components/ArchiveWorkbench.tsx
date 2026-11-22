"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type {
  ArchiveItem,
  AspectRatio,
  AuthSessionState,
  VaultState,
} from "@/types/archive";
import {
  DEFAULT_FILTER_STATE,
  INITIAL_VISIBLE_COUNT,
  LOAD_MORE_STEP,
  filterAndSortArchive,
  getVisibleArchiveSlice,
  parseBoardIds,
  resolveItemCountry,
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
import { getCanonicalMediaKey } from "@/lib/canonical-media";
import {
  VISUAL_TECHNIQUES,
  getTechniqueBySlug,
  matchesTechnique,
  searchItemByQuery,
} from "@/lib/visual-techniques";
import { EyecandyHeader } from "@/components/EyecandyHeader";
import {
  SidebarExplorer,
  type SidebarFilterSelection,
} from "@/components/SidebarExplorer";
import { BreakdownShowcase } from "@/components/BreakdownShowcase";
import { SlideMountCard } from "@/components/SlideMountCard";
import { ViewfinderModal } from "@/components/ViewfinderModal";
import { CompareDrawer } from "@/components/CompareDrawer";
import { MoodboardDrawer } from "@/components/MoodboardDrawer";
import { AuthModal } from "@/components/AuthModal";
import { BoardBookmarkIcon, CloseIcon, CompareIcon } from "@/components/Icons";

interface ArchiveWorkbenchProps {
  items: ArchiveItem[];
  initialSeed?: number;
}

type EyecandySortMode = "shuffle" | "popular" | "recent" | "title";
type EyecandyViewMode = "home" | "sidebar" | "technique";

const TYPED_HINTS = [
  'Search "Neon Noir"',
  'Search "Symmetry"',
  'Search "Tracking Shot"',
  'Search "도쿄 야경"',
  'Search "Retro TVCF"',
  'Search "VHS Analog"',
  'Search "Animation Cell"',
  'Search "35mm Grain"',
];

const ASPECT_HEIGHT_WEIGHT: Record<AspectRatio, number> = {
  "4:5": 1.25,
  "4:3": 0.75,
  "3:2": 0.667,
  "16:9": 0.5625,
  "2.39:1": 0.418,
};

// Eyecandy exact responsive columns: >=992px -> 5 cols, 768~991px -> 3 cols, <768px -> 2 cols
function getEyecandyColumnCount(width: number): number {
  if (width >= 992) return 5;
  if (width >= 768) return 3;
  return 2;
}

function distributeToColumns(
  list: ArchiveItem[],
  columnCount: number
): ArchiveItem[][] {
  const safeCols = Math.max(1, columnCount);
  const cols: ArchiveItem[][] = Array.from({ length: safeCols }, () => []);
  const heights = new Array<number>(safeCols).fill(0);

  for (const item of list) {
    let minIdx = 0;
    let minH = heights[0];
    for (let c = 1; c < safeCols; c += 1) {
      if (heights[c] < minH) {
        minH = heights[c];
        minIdx = c;
      }
    }
    cols[minIdx].push(item);
    heights[minIdx] += ASPECT_HEIGHT_WEIGHT[item.aspectRatio] ?? 0.75;
  }

  return cols;
}

const EMPTY_SIDEBAR_SELECTION: SidebarFilterSelection = {
  techniques: [],
  formats: [],
  decades: [],
  regions: [],
};

export function ArchiveWorkbench({
  items,
  initialSeed = 424242,
}: ArchiveWorkbenchProps) {
  const searchParams = useSearchParams();
  const [shuffleSeed, setShuffleSeed] = useState<number>(initialSeed);
  const [columnCount, setColumnCount] = useState<number>(5);
  const [scrolled, setScrolled] = useState<boolean>(false);
  const [pastHero, setPastHero] = useState<boolean>(false);

  // 4 Eyecandy view modes
  const [viewMode, setViewMode] = useState<EyecandyViewMode>("home");
  const [activeTechniqueSlug, setActiveTechniqueSlug] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<EyecandySortMode>("shuffle");
  const [rawSearch, setRawSearch] = useState<string>("");
  const [debouncedQuery, setDebouncedQuery] = useState<string>("");
  const [searchFocused, setSearchFocused] = useState<boolean>(false);
  const [typedHint, setTypedHint] = useState<string>(TYPED_HINTS[0]);
  const [sidebarSelection, setSidebarSelection] = useState<SidebarFilterSelection>(
    EMPTY_SIDEBAR_SELECTION
  );

  // Conduit & dead-tile eviction states
  const [savedConduitItems, setSavedConduitItems] = useState<ArchiveItem[]>([]);
  const [conduitItems, setConduitItems] = useState<ArchiveItem[]>([]);
  const [evictedIds, setEvictedIds] = useState<Set<string>>(() => new Set());
  const [conduitLoading, setConduitLoading] = useState<boolean>(false);
  const [conduitHasMore, setConduitHasMore] = useState<boolean>(true);

  const didInitRef = useRef<boolean>(false);
  const inFlightCursorRef = useRef<number | null>(null);
  const nextCursorRef = useRef<number>(1);
  const exhaustedRef = useRef<boolean>(false);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);

  // Canonical deduplicated master catalog
  const allCatalogItems = useMemo(() => {
    const out: ArchiveItem[] = [];
    const seenIds = new Set<string>();
    const seenCanonical = new Set<string>();
    const appendUnique = (entry: ArchiveItem) => {
      if (evictedIds.has(entry.id)) return;
      const canon = getCanonicalMediaKey(entry);
      if (seenIds.has(entry.id) || seenCanonical.has(canon)) return;
      seenIds.add(entry.id);
      seenCanonical.add(canon);
      out.push(entry);
    };
    for (const entry of items) appendUnique(entry);
    for (const entry of savedConduitItems) appendUnique(entry);
    for (const entry of conduitItems) appendUnique(entry);
    return out;
  }, [items, savedConduitItems, conduitItems, evictedIds]);

  const validIdSet = useMemo(
    () => new Set(allCatalogItems.map((i) => i.id)),
    [allCatalogItems]
  );

  const initialBoardParam = searchParams.get("board");
  const initialBoardIds = useMemo(
    () => parseBoardIds(initialBoardParam, validIdSet),
    [initialBoardParam, validIdSet]
  );

  const [boardIds, setBoardIds] = useState<string[]>(() =>
    parseBoardIds(
      searchParams.get("board"),
      new Set(items.map((i) => i.id))
    )
  );
  const [boardOnly, setBoardOnly] = useState<boolean>(false);
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

  const [vault, setVault] = useState<VaultState>(DEFAULT_VAULT_STATE);
  const [loadedAccountSub, setLoadedAccountSub] = useState<string | null>(null);
  const [session, setSession] = useState<AuthSessionState>({
    authenticated: false,
    user: null,
    cloudSyncAvailable: false,
  });

  // Responsive 5 / 3 / 2 column sync on mount and resize
  useEffect(() => {
    const syncLayout = () => {
      const nextCols = getEyecandyColumnCount(window.innerWidth);
      setColumnCount((prev) => (prev === nextCols ? prev : nextCols));
    };
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 20);
      setPastHero(y > 320);
    };
    syncLayout();
    onScroll();
    window.addEventListener("resize", syncLayout, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("resize", syncLayout);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  // Debounce search input (220ms)
  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedQuery(rawSearch.trim());
    }, 220);
    return () => window.clearTimeout(t);
  }, [rawSearch]);

  // Typed.js-style auto-typing hint animation in home search bar when unfocused & empty
  useEffect(() => {
    if (searchFocused || rawSearch.length > 0 || viewMode !== "home") return;
    let phraseIdx = 0;
    let charIdx = 0;
    let deleting = false;
    let timerId = 0;

    const tick = () => {
      const target = TYPED_HINTS[phraseIdx];
      if (!deleting) {
        charIdx += 1;
        setTypedHint(target.slice(0, charIdx));
        if (charIdx >= target.length) {
          deleting = true;
          timerId = window.setTimeout(tick, 1500);
          return;
        }
        timerId = window.setTimeout(tick, 55);
      } else {
        charIdx -= 1;
        setTypedHint(target.slice(0, charIdx));
        if (charIdx <= 0) {
          deleting = false;
          phraseIdx = (phraseIdx + 1) % TYPED_HINTS.length;
          timerId = window.setTimeout(tick, 320);
          return;
        }
        timerId = window.setTimeout(tick, 30);
      }
    };

    timerId = window.setTimeout(tick, 800);
    return () => window.clearTimeout(timerId);
  }, [searchFocused, rawSearch, viewMode]);

  const validIdSetRef = useRef<Set<string>>(validIdSet);
  validIdSetRef.current = validIdSet;
  const initialBoardIdsRef = useRef<string[]>(initialBoardIds);
  initialBoardIdsRef.current = initialBoardIds;

  const hydrateAccountVault = useCallback(async (userSub: string) => {
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

    const activeValidIds = validIdSetRef.current;
    const sharedIds = initialBoardIdsRef.current;
    const accountBoardIds = resolved.bookmarks
      .map((b) => b.itemId)
      .filter((id) => activeValidIds.has(id) || isConduitItemId(id));

    setBoardIds(
      sharedIds.length > 0
        ? Array.from(new Set([...accountBoardIds, ...sharedIds]))
        : accountBoardIds
    );
  }, []);

  // Strictly run ONCE on mount: hydrate persisted conduit saves & fetch /api/auth/session once
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;

    const persistedConduit = loadConduitSavedItems();
    if (persistedConduit.length > 0) {
      setSavedConduitItems(persistedConduit);
    }

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

  // Persist account-isolated vault whenever changed by signed-in user
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
    const serialized = serializeBoardIds(boardIds);
    if (serialized) {
      url.searchParams.set("board", serialized);
    } else {
      url.searchParams.delete("board");
    }
    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState(null, "", nextUrl);
  }, [boardIds]);

  const handleEvictItem = useCallback((itemId: string) => {
    setEvictedIds((prev) => {
      if (prev.has(itemId)) return prev;
      const next = new Set(prev);
      next.add(itemId);
      return next;
    });
  }, []);

  // Deterministic SSR-matched initial seed ordering (only re-runs when sortMode or shuffleSeed changes)
  const orderedSeedItems = useMemo(() => {
    const cleanSeed = items.filter((i) => !evictedIds.has(i.id));
    if (sortMode === "recent") {
      return filterAndSortArchive(cleanSeed, {
        ...DEFAULT_FILTER_STATE,
        sort: "year_desc",
      });
    }
    if (sortMode === "title") {
      return [...cleanSeed].sort((a, b) => a.titleKo.localeCompare(b.titleKo, "ko"));
    }
    if (sortMode === "popular") {
      return filterAndSortArchive(cleanSeed, {
        ...DEFAULT_FILTER_STATE,
        sort: "curation_density",
      });
    }
    const base = filterAndSortArchive(cleanSeed, {
      ...DEFAULT_FILTER_STATE,
      sort: "smart_mix",
    });
    return rotateArchiveWithSeed(base, shuffleSeed);
  }, [items, evictedIds, sortMode, shuffleSeed]);

  // Strictly Append-Only combined pool + view/search/technique/sidebar filtering
  const displayedPool = useMemo(() => {
    const baseList: ArchiveItem[] = [];
    const seenIds = new Set<string>();
    const seenCanonical = new Set<string>();
    const pushUnique = (entry: ArchiveItem) => {
      if (evictedIds.has(entry.id)) return;
      const canon = getCanonicalMediaKey(entry);
      if (seenIds.has(entry.id) || seenCanonical.has(canon)) return;
      seenIds.add(entry.id);
      seenCanonical.add(canon);
      baseList.push(entry);
    };

    for (const entry of orderedSeedItems) pushUnique(entry);
    if (boardOnly) {
      for (const entry of savedConduitItems) pushUnique(entry);
    }
    for (const entry of conduitItems) pushUnique(entry);

    return baseList.filter((item) => {
      if (boardOnly && !boardIds.includes(item.id)) return false;

      if (viewMode === "technique" && activeTechniqueSlug) {
        if (!matchesTechnique(item, activeTechniqueSlug)) return false;
      }

      if (viewMode === "sidebar") {
        if (
          sidebarSelection.techniques.length > 0 &&
          !sidebarSelection.techniques.some((slug) => matchesTechnique(item, slug))
        ) {
          return false;
        }
        if (sidebarSelection.formats.length > 0) {
          const isMotion = item.mediaSource === "archive_mp4";
          const ok = sidebarSelection.formats.some((fmt) =>
            fmt === "MOTION" ? isMotion : !isMotion
          );
          if (!ok) return false;
        }
        if (
          sidebarSelection.decades.length > 0 &&
          !sidebarSelection.decades.includes(item.era)
        ) {
          return false;
        }
        if (
          sidebarSelection.regions.length > 0 &&
          !sidebarSelection.regions.includes(resolveItemCountry(item))
        ) {
          return false;
        }
      }

      if (debouncedQuery.length > 0 && !searchItemByQuery(item, debouncedQuery)) {
        return false;
      }

      return true;
    });
  }, [
    orderedSeedItems,
    savedConduitItems,
    conduitItems,
    evictedIds,
    boardOnly,
    boardIds,
    viewMode,
    activeTechniqueSlug,
    sidebarSelection,
    debouncedQuery,
  ]);

  const visibleItems = useMemo(
    () => getVisibleArchiveSlice(displayedPool, visibleCount),
    [displayedPool, visibleCount]
  );

  const masonryColumns = useMemo(
    () => distributeToColumns(visibleItems, columnCount),
    [visibleItems, columnCount]
  );

  const hasMoreItems = visibleItems.length < displayedPool.length;
  const canLoadConduit = !boardOnly && conduitHasMore;

  const fetchNextConduitPage = useCallback(async () => {
    if (boardOnly || exhaustedRef.current || inFlightCursorRef.current !== null) {
      return;
    }

    const targetCursor = nextCursorRef.current;
    inFlightCursorRef.current = targetCursor;
    setConduitLoading(true);

    try {
      const activeTech = activeTechniqueSlug
        ? getTechniqueBySlug(activeTechniqueSlug)
        : undefined;
      const queryText = debouncedQuery || activeTech?.conduitQuery || "";

      const qs = new URLSearchParams({
        category: "ALL",
        country: "ALL",
        decade: "ALL",
        mediaMode: "MOTION",
        cursor: String(targetCursor),
        seed: String(shuffleSeed),
      });
      if (queryText) {
        qs.set("q", queryText);
      }

      const res = await fetch(`/api/archive/conduit?${qs.toString()}`, {
        cache: "default",
      });
      if (!res.ok) {
        exhaustedRef.current = true;
        setConduitHasMore(false);
        return;
      }

      const data = (await res.json()) as {
        items?: ArchiveItem[];
        nextCursor?: number | null;
        hasMore?: boolean;
      };

      const incoming = Array.isArray(data.items)
        ? data.items.filter(
            (entry) =>
              entry.mediaSource === "archive_mp4" && Boolean(entry.previewVideoUrl)
          )
        : [];

      if (incoming.length > 0) {
        setConduitItems((prev) => {
          const existingIds = new Set<string>([
            ...items.map((i) => i.id),
            ...prev.map((i) => i.id),
          ]);
          const existingCanonical = new Set<string>([
            ...items.map((i) => getCanonicalMediaKey(i)),
            ...prev.map((i) => getCanonicalMediaKey(i)),
          ]);

          const fresh: ArchiveItem[] = [];
          for (const entry of incoming) {
            const canon = getCanonicalMediaKey(entry);
            if (existingIds.has(entry.id) || existingCanonical.has(canon)) {
              continue;
            }
            existingIds.add(entry.id);
            existingCanonical.add(canon);
            fresh.push(entry);
          }
          return fresh.length > 0 ? [...prev, ...fresh] : prev;
        });
      }

      if (data.hasMore && typeof data.nextCursor === "number") {
        nextCursorRef.current = data.nextCursor;
        setConduitHasMore(true);
      } else {
        exhaustedRef.current = true;
        setConduitHasMore(false);
      }
    } catch {
      exhaustedRef.current = true;
      setConduitHasMore(false);
    } finally {
      inFlightCursorRef.current = null;
      setConduitLoading(false);
    }
  }, [boardOnly, activeTechniqueSlug, debouncedQuery, items, shuffleSeed]);

  // Infinite scroll sentinel
  useEffect(() => {
    if (!hasMoreItems && !canLoadConduit) return;
    const node = loadMoreSentinelRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setVisibleCount((prev) => {
          const next = Math.min(displayedPool.length, prev + LOAD_MORE_STEP);
          if (next >= displayedPool.length - 18) {
            void fetchNextConduitPage();
          }
          return next;
        });
      },
      { rootMargin: "640px 0px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMoreItems, canLoadConduit, displayedPool.length, fetchNextConduitPage]);

  const boardItems = useMemo(() => {
    const map = new Map(allCatalogItems.map((i) => [i.id, i]));
    return boardIds
      .map((id) => map.get(id))
      .filter((x): x is ArchiveItem => Boolean(x));
  }, [allCatalogItems, boardIds]);

  const selectedIndex = useMemo(
    () =>
      selectedItemId
        ? displayedPool.findIndex((i) => i.id === selectedItemId)
        : -1,
    [displayedPool, selectedItemId]
  );

  const selectedItem = useMemo(() => {
    if (!selectedItemId) return null;
    return allCatalogItems.find((i) => i.id === selectedItemId) ?? null;
  }, [allCatalogItems, selectedItemId]);

  const selectedBookmark = useMemo(() => {
    if (!selectedItemId) return undefined;
    return vault.bookmarks.find((b) => b.itemId === selectedItemId);
  }, [vault.bookmarks, selectedItemId]);

  const activeTechnique = activeTechniqueSlug
    ? getTechniqueBySlug(activeTechniqueSlug) ?? null
    : null;

  // Navigation handlers
  const handleGoHome = useCallback(() => {
    setViewMode("home");
    setActiveTechniqueSlug(null);
    setBoardOnly(false);
    setRawSearch("");
    setDebouncedQuery("");
    setSidebarSelection(EMPTY_SIDEBAR_SELECTION);
    setVisibleCount(INITIAL_VISIBLE_COUNT);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  const handleSelectTechnique = useCallback((slug: string) => {
    setActiveTechniqueSlug(slug);
    setViewMode("technique");
    setBoardOnly(false);
    setRawSearch("");
    setDebouncedQuery("");
    setVisibleCount(INITIAL_VISIBLE_COUNT);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  const handleToggleSidebar = useCallback(() => {
    setViewMode((prev) => (prev === "sidebar" ? "home" : "sidebar"));
    setActiveTechniqueSlug(null);
    setBoardOnly(false);
    setVisibleCount(INITIAL_VISIBLE_COUNT);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  const handleGoBreakdowns = useCallback(() => {
    setViewMode("home");
    setActiveTechniqueSlug(null);
    setBoardOnly(false);
    window.setTimeout(() => {
      document
        .getElementById("breakdowns-showcase")
        ?.scrollIntoView({ behavior: "smooth" });
    }, 80);
  }, []);

  const handleShuffleWall = useCallback(() => {
    setSortMode("shuffle");
    setShuffleSeed((prev) => prev + Math.floor(Math.random() * 997) + 37);
    setVisibleCount(INITIAL_VISIBLE_COUNT);
  }, []);

  const performToggleBoard = useCallback(
    (id: string, folderId?: string) => {
      const targetItem = allCatalogItems.find((entry) => entry.id === id);

      setBoardIds((prev) => {
        const exists = prev.includes(id);
        const nextBoardIds = exists
          ? prev.filter((b) => b !== id)
          : [...prev, id];
        if (isConduitItemId(id)) {
          if (exists) {
            setSavedConduitItems(removeConduitSavedItem(id));
          } else if (targetItem) {
            setSavedConduitItems(saveConduitSavedItem(targetItem));
          }
        }
        if (nextBoardIds.length === 0) {
          setBoardOnly(false);
        }
        return nextBoardIds;
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
      setBoardIds((prev) =>
        prev.includes(payload.itemId) ? prev : [...prev, payload.itemId]
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
    setBoardIds([]);
    setBoardOnly(false);
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

  const handleExportBackup = useCallback(() => {
    exportVaultToFile(vault, boardIds);
  }, [vault, boardIds]);

  const handleImportBackupFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== "string") return;
        const parsed = parseImportedVaultJson(reader.result, validIdSet);
        if (!parsed) return;
        setVault(parsed.vault);
        setBoardIds((prev) => Array.from(new Set([...prev, ...parsed.boardIds])));
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
    setBoardIds([]);
    setBoardOnly(false);
  }, []);

  const showHeaderCenterSearch =
    viewMode === "technique" || (viewMode === "home" && pastHero);

  const renderMasonryGrid = () => (
    <>
      {displayedPool.length > 0 ? (
        <>
          {/* Exact Eyecandy 5 / 3 / 2 Column Masonry: horizontal 7px, vertical 5px (mobile 2px) */}
          <section
            aria-label="큐레이션 무빙 아카이브 월"
            className="grid grid-cols-2 items-start gap-x-[7px] md:grid-cols-3 lg:grid-cols-5"
          >
            {masonryColumns.map((colItems, colIdx) => (
              <div
                key={`col-${colIdx}`}
                className="flex min-w-0 flex-col gap-y-[2px] md:gap-y-[5px]"
              >
                {colItems.map((item) => (
                  <SlideMountCard
                    key={item.id}
                    item={item}
                    isInBoard={boardIds.includes(item.id)}
                    isInCompare={compareIds.includes(item.id)}
                    compareFull={compareIds.length >= 2}
                    onOpenDetail={(target) => setSelectedItemId(target.id)}
                    onToggleBoard={handleToggleBoard}
                    onToggleCompare={handleToggleCompare}
                    onEvictItem={handleEvictItem}
                  />
                ))}
              </div>
            ))}
          </section>

          {(hasMoreItems || canLoadConduit) && (
            <div
              ref={loadMoreSentinelRef}
              className="mt-8 flex flex-col items-center justify-center py-4"
            >
              {conduitLoading ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="inline-flex h-9 items-center gap-2 rounded-[2rem] border border-[#fc087d]/50 bg-black px-5 font-mono text-[12px] tracking-wider text-[#d0d0d0]"
                >
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#fc087d]" />
                  <span>STREAMING ARCHIVE CONDUIT</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (hasMoreItems) {
                      setVisibleCount((prev) =>
                        Math.min(displayedPool.length, prev + LOAD_MORE_STEP)
                      );
                    } else {
                      void fetchNextConduitPage();
                    }
                  }}
                  className="inline-flex items-center justify-center rounded-[2rem] border border-[#fc087d] bg-black px-9 py-2 text-[0.9rem] font-medium uppercase tracking-wider text-white transition-colors duration-200 hover:bg-[#fc087d] hover:text-black"
                >
                  Load more
                </button>
              )}
            </div>
          )}
        </>
      ) : (
        <section className="flex flex-col items-center justify-center rounded-[16px] border border-white/15 bg-black px-6 py-24 text-center">
          <h2 className="text-[1.4rem] font-semibold text-white">
            일치하는 무빙 클립이 없습니다
          </h2>
          <p className="mt-2 text-[0.95rem] text-[#9b9b9b]">
            검색어를 바꾸거나 전체 아카이브 월로 돌아가세요.
          </p>
          <button
            type="button"
            onClick={handleGoHome}
            className="mt-6 rounded-[2rem] bg-[#fc087d] px-7 py-2 text-[0.9rem] font-semibold uppercase text-black transition-opacity hover:opacity-90"
          >
            Reset to All Clips
          </button>
        </section>
      )}
    </>
  );

  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <EyecandyHeader
        scrolled={scrolled}
        showCenterSearch={showHeaderCenterSearch}
        searchQuery={rawSearch}
        onSearchChange={(val) => {
          setRawSearch(val);
        }}
        onSearchSubmit={() => {
          if (rawSearch.trim()) {
            setViewMode("sidebar");
          }
        }}
        viewMode={viewMode}
        activeTechniqueSlug={activeTechniqueSlug}
        session={session}
        savedCount={boardIds.length}
        compareCount={compareIds.length}
        onGoHome={handleGoHome}
        onToggleSidebar={handleToggleSidebar}
        onSelectTechnique={handleSelectTechnique}
        onGoBreakdowns={handleGoBreakdowns}
        onShuffleWall={handleShuffleWall}
        onOpenBoard={() => setBoardOpen(true)}
        onOpenAuth={() => setAuthOpen(true)}
        onOpenCompare={() => setCompareOpen(true)}
      />

      <main className="w-full flex-1 pt-16">
        {/* Shared ?board= Restoration Banner (Accessible to Both Guests & Signed-In Users) */}
        {initialBoardIds.length > 0 && !sharedBannerDismissed && (
          <div className="mx-4 mb-4 mt-2 flex flex-wrap items-center justify-between gap-2 rounded-[16px] border border-[#fc087d]/50 bg-[#fc087d]/10 px-5 py-2.5 text-[0.9rem] lg:mx-8">
            <div className="flex items-center gap-2 text-white">
              <BoardBookmarkIcon className="h-4 w-4 text-[#fc087d]" filled />
              <span>
                공유 보드 링크에서 <strong>{initialBoardIds.length}개</strong>의
                아카이브가 열렸습니다.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setBoardOnly((prev) => !prev)}
                className="rounded-[2rem] border border-[#fc087d] bg-black px-3.5 py-1 text-[0.8rem] font-semibold text-[#fc087d]"
              >
                {boardOnly ? "전체 보기" : "공유 컷만 보기"}
              </button>
              <button
                type="button"
                onClick={() => setBoardOpen(true)}
                className="rounded-[2rem] bg-[#fc087d] px-3.5 py-1 text-[0.8rem] font-bold text-black"
              >
                보드 열기
              </button>
              <button
                type="button"
                onClick={() => setSharedBannerDismissed(true)}
                aria-label="알림 닫기"
                className="p-1 text-[#d0d0d0] hover:text-white"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* VIEW 1: HOME HERO (Centered 56px Wordmark + 28 Technique Tag Cloud + Search & Pink Sort Capsule) */}
        {viewMode === "home" && (
          <>
            <section
              aria-label="시네마 기법 탐색 허브"
              className="flex flex-col items-center px-4 pb-8 pt-6 sm:pt-8"
            >
              <button
                type="button"
                onClick={handleGoHome}
                className="mb-4 text-[2.4rem] font-semibold leading-none tracking-[-0.02em] text-[#fc087d] sm:text-[3.5rem]"
              >
                KINOFRAME
              </button>

              {/* 28 Visual Technique Tag Cloud (60% / max-w 75rem centered flex-wrap) */}
              <ul className="mx-auto flex w-[94%] max-w-[75rem] flex-wrap justify-center lg:w-[60%]">
                {VISUAL_TECHNIQUES.map((tech) => (
                  <li key={tech.slug} className="mx-[0.3rem] mb-[0.3rem]">
                    <button
                      type="button"
                      onClick={() => handleSelectTechnique(tech.slug)}
                      className="eyecandy-tag-link"
                    >
                      {tech.label}
                    </button>
                  </li>
                ))}
              </ul>

              {/* Search Bar (1px #fc087d pill) + Solid #fc087d Sort Capsule */}
              <div className="mx-auto mt-4 flex w-[94%] max-w-[75rem] flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-0 lg:w-[60%]">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (rawSearch.trim()) setViewMode("sidebar");
                  }}
                  className="relative flex-1"
                >
                  <button
                    type="submit"
                    aria-label="검색"
                    className="absolute left-3.5 top-1/2 z-10 -translate-y-1/2 text-[#fc047c]"
                  >
                    <svg viewBox="0 0 30 30" className="h-[19px] w-[19px]" fill="currentColor">
                      <path d="M 13 3 C 7.489 3 3 7.489 3 13 C 3 18.511 7.489 23 13 23 C 15.397 23 17.597 22.149 19.322 20.736 L 25.293 26.707 A 1 1 0 1 0 26.707 25.293 L 20.736 19.322 C 22.149 17.597 23 15.397 23 13 C 23 7.489 18.511 3 13 3 z M 13 5 C 17.43 5 21 8.57 21 13 C 21 17.43 17.43 21 13 21 C 8.57 21 5 17.43 5 13 C 5 8.57 8.57 5 13 5 z" />
                    </svg>
                  </button>

                  {!searchFocused && rawSearch.length === 0 && (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute left-10 top-1/2 -translate-y-1/2 truncate text-[0.95rem] text-white/40"
                    >
                      {typedHint}
                      <span className="ml-0.5 inline-block h-3.5 w-[1px] animate-pulse bg-[#fc087d] align-middle" />
                    </span>
                  )}

                  <input
                    type="text"
                    value={rawSearch}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setSearchFocused(false)}
                    onChange={(e) => setRawSearch(e.target.value)}
                    aria-label="비주얼 아카이브 검색"
                    placeholder={searchFocused ? "기법, 도시, 연도, 한글·영문 검색..." : ""}
                    className="w-full rounded-[2rem] border border-[#fc087d] bg-transparent py-[0.45rem] pl-10 pr-8 text-[0.95rem] text-white placeholder:text-[#747474] focus:bg-black focus:outline-none"
                  />

                  {rawSearch && (
                    <button
                      type="button"
                      onClick={() => {
                        setRawSearch("");
                        setDebouncedQuery("");
                      }}
                      aria-label="검색어 지우기"
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#9b9b9b] hover:text-white"
                    >
                      <CloseIcon className="h-3.5 w-3.5" />
                    </button>
                  )}
                </form>

                {/* Right Solid #fc087d Sort Capsule */}
                <div className="relative sm:ml-4 sm:min-w-[165px]">
                  <select
                    aria-label="정렬 방식 선택"
                    value={sortMode}
                    onChange={(e) => {
                      const next = e.target.value as EyecandySortMode;
                      setSortMode(next);
                      if (next === "shuffle") {
                        setShuffleSeed(
                          (prev) => prev + Math.floor(Math.random() * 997) + 23
                        );
                      }
                    }}
                    className="w-full appearance-none rounded-[2rem] border border-[#fc087d] bg-[#fc087d] py-[0.5rem] pl-4 pr-9 text-[0.92rem] font-semibold text-black focus:outline-none"
                  >
                    <option value="shuffle">Shuffle</option>
                    <option value="popular">Most popular</option>
                    <option value="recent">Recently added</option>
                    <option value="title">Title</option>
                  </select>
                  <svg
                    viewBox="0 0 12 8"
                    aria-hidden="true"
                    className="pointer-events-none absolute right-3.5 top-1/2 h-2.5 w-2.5 -translate-y-1/2 text-black"
                    fill="currentColor"
                  >
                    <path d="M1.4 0L6 4.6 10.6 0 12 1.4 6 7.4 0 1.4z" />
                  </svg>
                </div>
              </div>
            </section>

            {/* Home 5-Column Moving Wall (px-4 lg:px-[2rem]) */}
            <div className="w-full px-4 lg:px-8">{renderMasonryGrid()}</div>

            {/* VIEW 4: BREAKING DOWN Stacked Full-Bleed Showcase */}
            <BreakdownShowcase
              items={allCatalogItems}
              onExploreTechnique={handleSelectTechnique}
            />
          </>
        )}

        {/* VIEW 2: LEFT ACCORDION SIDEBAR EXPLORER (.sec-search) */}
        {viewMode === "sidebar" && (
          <div className="flex w-full flex-col gap-6 px-4 py-4 md:flex-row md:gap-8 md:px-6">
            <SidebarExplorer
              allItems={allCatalogItems}
              searchQuery={rawSearch}
              onSearchChange={setRawSearch}
              selection={sidebarSelection}
              onChangeSelection={(next) => {
                setSidebarSelection(next);
                setVisibleCount(INITIAL_VISIBLE_COUNT);
              }}
              onResetAll={() => {
                setRawSearch("");
                setDebouncedQuery("");
                setSidebarSelection(EMPTY_SIDEBAR_SELECTION);
              }}
            />

            <div className="min-w-0 flex-1">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[0.85rem] text-[#d0d0d0]">
                    {displayedPool.length} clips
                  </span>
                  {sidebarSelection.techniques.map((slug) => {
                    const tech = getTechniqueBySlug(slug);
                    if (!tech) return null;
                    return (
                      <button
                        key={`chip-${slug}`}
                        type="button"
                        onClick={() =>
                          setSidebarSelection((prev) => ({
                            ...prev,
                            techniques: prev.techniques.filter((s) => s !== slug),
                          }))
                        }
                        className="inline-flex items-center gap-1.5 rounded-[1rem] border border-[#fc087d] px-2.5 py-0.5 text-[0.8rem] text-white"
                      >
                        <span>{tech.label}</span>
                        <span className="text-[#fc087d]">×</span>
                      </button>
                    );
                  })}
                </div>

                <div className="relative">
                  <select
                    aria-label="결과 정렬"
                    value={sortMode}
                    onChange={(e) => setSortMode(e.target.value as EyecandySortMode)}
                    className="appearance-none rounded-[1rem] border border-[#fc087d] bg-black py-1 pl-3 pr-7 text-[0.85rem] text-white focus:outline-none"
                  >
                    <option value="shuffle">Shuffle</option>
                    <option value="popular">Most popular</option>
                    <option value="recent">Recently added</option>
                    <option value="title">Title</option>
                  </select>
                  <svg
                    viewBox="0 0 12 8"
                    aria-hidden="true"
                    className="pointer-events-none absolute right-2.5 top-1/2 h-2 w-2 -translate-y-1/2 text-white"
                    fill="currentColor"
                  >
                    <path d="M1.4 0L6 4.6 10.6 0 12 1.4 6 7.4 0 1.4z" />
                  </svg>
                </div>
              </div>

              {renderMasonryGrid()}
            </div>
          </div>
        )}

        {/* VIEW 3: TECHNIQUE DETAIL VIEW (Echo print 96px H1 Style) */}
        {viewMode === "technique" && activeTechnique && (
          <div className="w-full">
            <section className="px-4 pb-6 pt-6 lg:px-8">
              <button
                type="button"
                onClick={handleGoHome}
                className="mb-3 inline-flex items-center gap-1.5 text-[0.9rem] font-medium text-[#fc087d] hover:underline"
              >
                <span>← All techniques</span>
              </button>

              <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white pb-3">
                <h1 className="text-[clamp(2.4rem,6vw,6rem)] font-normal leading-[1.15] tracking-[-0.02em] text-white">
                  {activeTechnique.label}
                </h1>
                <span className="pb-2 font-mono text-[0.9rem] text-[#d0d0d0]">
                  {activeTechnique.labelKo} · {displayedPool.length} clips
                </span>
              </div>

              <p className="mt-4 max-w-2xl text-[1rem] leading-[1.45] text-[#d0d0d0]">
                {activeTechnique.descriptionKo}
              </p>
            </section>

            <div className="w-full px-2 lg:px-4">{renderMasonryGrid()}</div>
          </div>
        )}
      </main>

      {/* Minimal Pure-Black Footer */}
      <footer className="border-t border-white/10 bg-black py-5">
        <div className="mx-auto flex w-full flex-col items-start justify-between gap-2 px-6 font-mono text-[12px] text-[#9b9b9b] sm:flex-row sm:items-center lg:px-8">
          <span className="text-[#fc087d]">KINOFRAME · VISUAL TECHNIQUE ARCHIVE</span>
          <span>Internet Archive · Wikimedia Commons · NASA Images</span>
        </div>
      </footer>

      {/* Floating Bottom Compare Dock */}
      {compareIds.length > 0 && !compareOpen && (
        <div className="fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-[2rem] border border-[#fc087d] bg-black/95 px-5 py-2.5 shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-2 text-[14px] text-white">
            <CompareIcon className="h-4 w-4 text-[#fc087d]" />
            <span>
              비교 선택{" "}
              <strong className="font-mono text-[#fc087d]">
                {compareIds.join(" × ")}
              </strong>
            </span>
          </div>
          <button
            type="button"
            onClick={() => setCompareOpen(true)}
            className="rounded-[2rem] bg-[#fc087d] px-4 py-1 text-[13px] font-bold text-black hover:opacity-90"
          >
            좌우 비교 열기
          </button>
          <button
            type="button"
            onClick={() => setCompareIds([])}
            aria-label="비교 슬롯 비우기"
            className="text-[#d0d0d0] hover:text-white"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Eyecandy .grid-popup Lightbox */}
      {selectedItem && (
        <ViewfinderModal
          item={selectedItem}
          allItems={allCatalogItems}
          hasPrev={selectedIndex > 0}
          hasNext={
            selectedIndex >= 0 && selectedIndex < displayedPool.length - 1
          }
          isAuthenticated={session.authenticated}
          isInBoard={boardIds.includes(selectedItem.id)}
          isInCompare={compareIds.includes(selectedItem.id)}
          compareFull={compareIds.length >= 2}
          folders={vault.folders}
          existingBookmark={selectedBookmark}
          onClose={() => setSelectedItemId(null)}
          onPrev={() => {
            if (selectedIndex > 0) {
              setSelectedItemId(displayedPool[selectedIndex - 1].id);
            }
          }}
          onNext={() => {
            if (
              selectedIndex >= 0 &&
              selectedIndex < displayedPool.length - 1
            ) {
              const nextIdx = selectedIndex + 1;
              setSelectedItemId(displayedPool[nextIdx].id);
              if (nextIdx >= visibleCount) {
                setVisibleCount((prev) =>
                  Math.min(
                    displayedPool.length,
                    Math.max(prev, nextIdx + LOAD_MORE_STEP)
                  )
                );
              }
            }
          }}
          onSelectItem={(target) => setSelectedItemId(target.id)}
          onSelectTechnique={handleSelectTechnique}
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

      {/* Account Multi-Board Drawer */}
      {boardOpen && (
        <MoodboardDrawer
          items={boardItems}
          vault={vault}
          session={session}
          boardOnly={boardOnly}
          onClose={() => setBoardOpen(false)}
          onRemoveItem={(id) => performToggleBoard(id)}
          onClearBoard={handleClearBoard}
          onToggleBoardOnly={() => setBoardOnly((prev) => !prev)}
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
          savedCount={boardIds.length}
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
