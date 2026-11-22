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
  resolveItemCategory,
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
  OPTICAL_BRANCHES,
  VISUAL_TECHNIQUES,
  getBranchBySlug,
  getSiblingTechniques,
  getTechniqueBySlug,
  getTechniquesByBranch,
  matchesBranch,
  matchesTechnique,
  searchItemByQuery,
  type OpticalBranchSlug,
} from "@/lib/visual-techniques";
import { EyecandyHeader } from "@/components/EyecandyHeader";
import { HeroSearchBar, type WallSortMode } from "@/components/HeroSearchBar";
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

type WorkbenchViewMode = "home" | "sidebar" | "technique";

// 4:5 portrait items render in normalized 4:3 frames on the grid for even column balance
const ASPECT_HEIGHT_WEIGHT: Record<AspectRatio, number> = {
  "4:5": 0.75,
  "4:3": 0.75,
  "3:2": 0.667,
  "16:9": 0.5625,
  "2.39:1": 0.418,
};

// Responsive 5 / 3 / 2 column counts
function getResponsiveColumnCount(width: number): number {
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

  // View modes & Optical Taxonomy Tree selection
  const [viewMode, setViewMode] = useState<WorkbenchViewMode>("home");
  const [activeBranchSlug, setActiveBranchSlug] =
    useState<OpticalBranchSlug | null>(null);
  const [activeTechniqueSlug, setActiveTechniqueSlug] = useState<string | null>(
    null
  );
  const [sortMode, setSortMode] = useState<WallSortMode>("shuffle");
  const [rawSearch, setRawSearch] = useState<string>("");
  const [debouncedQuery, setDebouncedQuery] = useState<string>("");
  const [sidebarSelection, setSidebarSelection] =
    useState<SidebarFilterSelection>(EMPTY_SIDEBAR_SELECTION);

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
      const nextCols = getResponsiveColumnCount(window.innerWidth);
      setColumnCount((prev) => (prev === nextCols ? prev : nextCols));
    };
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled((prev) => {
        const next = y > 20;
        return prev === next ? prev : next;
      });
      setPastHero((prev) => {
        const next = y > 320;
        return prev === next ? prev : next;
      });
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

  // Memoized card callbacks so React.memo(SlideMountCard) never re-renders unnecessarily
  const handleOpenDetail = useCallback((target: ArchiveItem) => {
    setSelectedItemId(target.id);
  }, []);

  const handleEvictItem = useCallback((itemId: string) => {
    setEvictedIds((prev) => {
      if (prev.has(itemId)) return prev;
      const next = new Set(prev);
      next.add(itemId);
      return next;
    });
  }, []);

  // Deterministic SSR-matched initial seed ordering (color CLASSIC_FILM & TVCF prioritized at top)
  const orderedSeedItems = useMemo(() => {
    const cleanSeed = items.filter((i) => !evictedIds.has(i.id));
    if (sortMode === "recent") {
      return filterAndSortArchive(cleanSeed, {
        ...DEFAULT_FILTER_STATE,
        sort: "year_desc",
      });
    }
    if (sortMode === "title") {
      return [...cleanSeed].sort((a, b) =>
        a.titleKo.localeCompare(b.titleKo, "ko")
      );
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

  // Strictly Append-Only combined pool + view/branch/technique/sidebar/search filtering
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

      if (viewMode === "home" && activeBranchSlug) {
        if (!matchesBranch(item, activeBranchSlug)) return false;
      }

      if (viewMode === "technique" && activeTechniqueSlug) {
        if (!matchesTechnique(item, activeTechniqueSlug)) return false;
      }

      if (viewMode === "sidebar") {
        if (
          sidebarSelection.techniques.length > 0 &&
          !sidebarSelection.techniques.some((slug) =>
            matchesTechnique(item, slug)
          )
        ) {
          return false;
        }
        if (sidebarSelection.formats.length > 0) {
          const cat = resolveItemCategory(item);
          const isMotion = item.mediaSource === "archive_mp4";
          const ok = sidebarSelection.formats.some((fmt) => {
            if (fmt === "CLASSIC_FILM") return cat === "CLASSIC_FILM";
            if (fmt === "TVCF") return cat === "TVCF";
            if (fmt === "MOTION") return isMotion;
            return !isMotion;
          });
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

      if (
        debouncedQuery.length > 0 &&
        !searchItemByQuery(item, debouncedQuery)
      ) {
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
    activeBranchSlug,
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
              entry.mediaSource === "archive_mp4" &&
              Boolean(entry.previewVideoUrl)
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
  const activeTechniqueBranch = activeTechnique
    ? getBranchBySlug(activeTechnique.branchSlug) ?? null
    : null;
  const siblingTechniques = activeTechnique
    ? getSiblingTechniques(activeTechnique.slug)
    : [];

  const heroTechniques = useMemo(
    () =>
      activeBranchSlug
        ? getTechniquesByBranch(activeBranchSlug)
        : VISUAL_TECHNIQUES,
    [activeBranchSlug]
  );

  // Navigation handlers
  const handleGoHome = useCallback(() => {
    setViewMode("home");
    setActiveBranchSlug(null);
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

  const handleSelectBranch = useCallback((branchSlug: OpticalBranchSlug | null) => {
    setViewMode("home");
    setActiveTechniqueSlug(null);
    setActiveBranchSlug(branchSlug);
    setBoardOnly(false);
    setVisibleCount(INITIAL_VISIBLE_COUNT);
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

  const handleHeroSearchClear = useCallback(() => {
    setRawSearch("");
    setDebouncedQuery("");
  }, []);

  const handleHeroSearchSubmit = useCallback(() => {
    if (rawSearch.trim()) {
      setViewMode("sidebar");
    }
  }, [rawSearch]);

  const handleSortModeChange = useCallback((next: WallSortMode) => {
    setSortMode(next);
    if (next === "shuffle") {
      setShuffleSeed((prev) => prev + Math.floor(Math.random() * 997) + 23);
    }
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
        setBoardIds((prev) =>
          Array.from(new Set([...prev, ...parsed.boardIds]))
        );
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
          {/* Locked 5 / 3 / 2 Column Masonry: horizontal 7px, vertical 5px (mobile 2px) */}
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
                    onOpenDetail={handleOpenDetail}
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
                  className="inline-flex h-9 items-center gap-2 rounded-[2rem] border border-[#F3A833]/50 bg-[#111318] px-5 font-mono text-[12px] tracking-wider text-[#C8C4BC]"
                >
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#F3A833]" />
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
                  className="inline-flex items-center justify-center rounded-[2rem] border border-[#F3A833] bg-black px-9 py-2 text-[0.9rem] font-semibold uppercase tracking-wider text-[#FAF7F0] transition-colors duration-200 hover:bg-[#F3A833] hover:text-black"
                >
                  Load more
                </button>
              )}
            </div>
          )}
        </>
      ) : (
        <section className="flex flex-col items-center justify-center rounded-[16px] border border-white/15 bg-[#111318] px-6 py-24 text-center">
          <h2 className="text-[1.4rem] font-semibold text-[#FAF7F0]">
            일치하는 무빙 클립이 없습니다
          </h2>
          <p className="mt-2 text-[0.95rem] text-[#7E7B74]">
            검색어를 바꾸거나 전체 아카이브 월로 돌아가세요.
          </p>
          <button
            type="button"
            onClick={handleGoHome}
            className="mt-6 rounded-[2rem] bg-[#F3A833] px-7 py-2 text-[0.9rem] font-semibold uppercase text-black transition-colors hover:bg-[#FFBE55]"
          >
            Reset to All Clips
          </button>
        </section>
      )}
    </>
  );

  return (
    <div className="flex min-h-screen flex-col bg-black text-[#FAF7F0]">
      <EyecandyHeader
        scrolled={scrolled}
        showCenterSearch={showHeaderCenterSearch}
        searchQuery={rawSearch}
        onSearchChange={setRawSearch}
        onSearchSubmit={handleHeroSearchSubmit}
        viewMode={viewMode}
        activeTechniqueSlug={activeTechniqueSlug}
        session={session}
        savedCount={boardIds.length}
        compareCount={compareIds.length}
        onGoHome={handleGoHome}
        onToggleSidebar={handleToggleSidebar}
        onSelectTechnique={handleSelectTechnique}
        onSelectBranch={handleSelectBranch}
        onGoBreakdowns={handleGoBreakdowns}
        onShuffleWall={handleShuffleWall}
        onOpenBoard={() => setBoardOpen(true)}
        onOpenAuth={() => setAuthOpen(true)}
        onOpenCompare={() => setCompareOpen(true)}
      />

      <main className="w-full flex-1 pt-16">
        {/* Shared ?board= Restoration Banner (Accessible to Both Guests & Signed-In Users) */}
        {initialBoardIds.length > 0 && !sharedBannerDismissed && (
          <div className="mx-4 mb-4 mt-2 flex flex-wrap items-center justify-between gap-2 rounded-[16px] border border-[#F3A833]/50 bg-[#F3A833]/10 px-5 py-2.5 text-[0.9rem] lg:mx-8">
            <div className="flex items-center gap-2 text-[#FAF7F0]">
              <BoardBookmarkIcon className="h-4 w-4 text-[#F3A833]" filled />
              <span>
                공유 보드 링크에서 <strong>{initialBoardIds.length}개</strong>의
                아카이브가 열렸습니다.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setBoardOnly((prev) => !prev)}
                className="rounded-[2rem] border border-[#F3A833] bg-black px-3.5 py-1 text-[0.8rem] font-semibold text-[#F3A833] hover:bg-[#F3A833]/15"
              >
                {boardOnly ? "전체 보기" : "공유 컷만 보기"}
              </button>
              <button
                type="button"
                onClick={() => setBoardOpen(true)}
                className="rounded-[2rem] bg-[#F3A833] px-3.5 py-1 text-[0.8rem] font-bold text-black hover:bg-[#FFBE55]"
              >
                보드 열기
              </button>
              <button
                type="button"
                onClick={() => setSharedBannerDismissed(true)}
                aria-label="알림 닫기"
                className="p-1 text-[#C8C4BC] hover:text-[#FAF7F0]"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* VIEW 1: HOME HERO (Kodak 500T Wordmark + 5 Optical Branches + 25 Technique Cloud + Isolated HeroSearchBar) */}
        {viewMode === "home" && (
          <>
            <section
              aria-label="광학 기법 트리 탐색 허브"
              className="flex flex-col items-center px-4 pb-8 pt-6 sm:pt-8"
            >
              <button
                type="button"
                onClick={handleGoHome}
                className="mb-4 text-[2.4rem] font-semibold leading-none tracking-[-0.02em] text-[#F3A833] transition-colors hover:text-[#FFBE55] sm:text-[3.4rem]"
              >
                KINOFRAME
              </button>

              {/* 5 Optical Branch Capsule Tabs */}
              <div
                role="tablist"
                aria-label="5대 광학 대분류 트리"
                className="mx-auto mb-4 flex w-[94%] max-w-[75rem] flex-wrap items-center justify-center gap-2"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeBranchSlug === null}
                  onClick={() => handleSelectBranch(null)}
                  className={`rounded-[2rem] border px-3.5 py-1 text-[0.78rem] font-semibold uppercase tracking-wide transition-colors ${
                    activeBranchSlug === null
                      ? "border-[#F3A833] bg-[#F3A833] text-black"
                      : "border-white/15 bg-[#111318] text-[#C8C4BC] hover:border-[#F3A833]/70 hover:text-[#FAF7F0]"
                  }`}
                >
                  All Branches
                </button>
                {OPTICAL_BRANCHES.map((branch) => {
                  const active = activeBranchSlug === branch.slug;
                  return (
                    <button
                      key={branch.slug}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() =>
                        handleSelectBranch(active ? null : branch.slug)
                      }
                      className={`rounded-[2rem] border px-3.5 py-1 text-[0.78rem] font-semibold uppercase tracking-wide transition-colors ${
                        active
                          ? "border-[#F3A833] bg-[#F3A833] text-black"
                          : "border-white/15 bg-[#111318] text-[#C8C4BC] hover:border-[#F3A833]/70 hover:text-[#FAF7F0]"
                      }`}
                    >
                      {branch.label}
                    </button>
                  );
                })}
              </div>

              {/* 25 Optical Technique Tag Cloud (Center-Expanding #F3A833 Underline) */}
              <ul className="mx-auto flex w-[94%] max-w-[75rem] flex-wrap justify-center lg:w-[68%]">
                {heroTechniques.map((tech) => (
                  <li key={tech.slug} className="mx-[0.42rem] mb-[0.35rem]">
                    <button
                      type="button"
                      onClick={() => handleSelectTechnique(tech.slug)}
                      className="kf-technique-link"
                    >
                      {tech.label}
                    </button>
                  </li>
                ))}
              </ul>

              {/* Isolated Leaf Component: Auto-typing animation never re-renders ArchiveWorkbench or Grid */}
              <HeroSearchBar
                value={rawSearch}
                onChange={setRawSearch}
                onClear={handleHeroSearchClear}
                onSubmit={handleHeroSearchSubmit}
                sortMode={sortMode}
                onSortChange={handleSortModeChange}
              />
            </section>

            {/* Home 5-Column Moving Wall */}
            <div className="w-full px-4 lg:px-8">{renderMasonryGrid()}</div>

            {/* BREAKING DOWN Stacked Full-Bleed Showcase */}
            <BreakdownShowcase
              items={allCatalogItems}
              onExploreTechnique={handleSelectTechnique}
            />
          </>
        )}

        {/* VIEW 2: LEFT ACCORDION OPTICAL TREE SIDEBAR EXPLORER */}
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
                  <span className="text-[0.85rem] text-[#C8C4BC]">
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
                            techniques: prev.techniques.filter(
                              (s) => s !== slug
                            ),
                          }))
                        }
                        className="inline-flex items-center gap-1.5 rounded-[1rem] border border-[#F3A833] bg-[#111318] px-2.5 py-0.5 text-[0.8rem] text-[#FAF7F0]"
                      >
                        <span>{tech.label}</span>
                        <span className="text-[#F3A833]">×</span>
                      </button>
                    );
                  })}
                </div>

                <div className="relative">
                  <select
                    aria-label="결과 정렬"
                    value={sortMode}
                    onChange={(e) =>
                      handleSortModeChange(e.target.value as WallSortMode)
                    }
                    className="appearance-none rounded-[1rem] border border-[#F3A833] bg-[#111318] py-1 pl-3 pr-7 text-[0.85rem] text-[#FAF7F0] focus:outline-none"
                  >
                    <option value="shuffle">Shuffle</option>
                    <option value="popular">Most popular</option>
                    <option value="recent">Recently added</option>
                    <option value="title">Title</option>
                  </select>
                  <svg
                    viewBox="0 0 12 8"
                    aria-hidden="true"
                    className="pointer-events-none absolute right-2.5 top-1/2 h-2 w-2 -translate-y-1/2 text-[#F3A833]"
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

        {/* VIEW 3: TECHNIQUE DETAIL VIEW (Branch Breadcrumb + Motion Blur H1 + Sibling Tree Switcher) */}
        {viewMode === "technique" && activeTechnique && (
          <div className="w-full">
            <section className="px-4 pb-6 pt-6 lg:px-8">
              <div className="mb-3 flex flex-wrap items-center gap-2 text-[0.85rem] font-medium uppercase tracking-wider">
                <button
                  type="button"
                  onClick={handleGoHome}
                  className="text-[#C8C4BC] transition-colors hover:text-[#F3A833]"
                >
                  ← All Techniques
                </button>
                {activeTechniqueBranch && (
                  <>
                    <span className="text-[#7E7B74]">/</span>
                    <button
                      type="button"
                      onClick={() =>
                        handleSelectBranch(activeTechniqueBranch.slug)
                      }
                      className="text-[#F3A833] transition-colors hover:text-[#FFBE55] hover:underline"
                    >
                      {activeTechniqueBranch.label} /
                    </button>
                  </>
                )}
              </div>

              <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/25 pb-3">
                <h1 className="text-[clamp(2.4rem,6vw,5.5rem)] font-normal leading-[1.12] tracking-[-0.02em] text-[#FAF7F0]">
                  {activeTechnique.label}
                </h1>
                <span className="pb-2 font-mono text-[0.9rem] text-[#C8C4BC]">
                  {activeTechnique.labelKo} · {displayedPool.length} clips
                </span>
              </div>

              <p className="mt-4 max-w-3xl text-[1rem] leading-[1.55] text-[#C8C4BC]">
                {activeTechnique.descriptionKo}
              </p>

              {/* Same-Branch Sibling Technique Quick-Switch Tree Chips */}
              {siblingTechniques.length > 0 && (
                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <span className="mr-1 font-mono text-[11px] uppercase tracking-wider text-[#7E7B74]">
                    {activeTechniqueBranch?.labelKo}:
                  </span>
                  {siblingTechniques.map((sib) => {
                    const isCurrent = sib.slug === activeTechnique.slug;
                    return (
                      <button
                        key={`sib-${sib.slug}`}
                        type="button"
                        onClick={() => handleSelectTechnique(sib.slug)}
                        className={`rounded-[2rem] border px-3.5 py-1 text-[0.8rem] font-medium transition-colors ${
                          isCurrent
                            ? "border-[#F3A833] bg-[#F3A833] font-semibold text-black"
                            : "border-white/15 bg-[#111318] text-[#FAF7F0] hover:border-[#F3A833] hover:text-[#F3A833]"
                        }`}
                      >
                        {sib.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            <div className="w-full px-2 lg:px-4">{renderMasonryGrid()}</div>
          </div>
        )}
      </main>

      {/* Minimal Pure-Black Footer */}
      <footer className="border-t border-white/10 bg-black py-5">
        <div className="mx-auto flex w-full flex-col items-start justify-between gap-2 px-6 font-mono text-[12px] text-[#7E7B74] sm:flex-row sm:items-center lg:px-8">
          <span className="text-[#F3A833]">
            KINOFRAME · 2.39:1 OPTICAL CINEMA ARCHIVE
          </span>
          <span>Internet Archive · Wikimedia Commons · NASA Images</span>
        </div>
      </footer>

      {/* Floating Bottom Compare Dock */}
      {compareIds.length > 0 && !compareOpen && (
        <div className="fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-[2rem] border border-[#F3A833] bg-[#111318]/95 px-5 py-2.5 shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-2 text-[14px] text-[#FAF7F0]">
            <CompareIcon className="h-4 w-4 text-[#F3A833]" />
            <span>
              비교 선택{" "}
              <strong className="font-mono text-[#F3A833]">
                {compareIds.join(" × ")}
              </strong>
            </span>
          </div>
          <button
            type="button"
            onClick={() => setCompareOpen(true)}
            className="rounded-[2rem] bg-[#F3A833] px-4 py-1 text-[13px] font-bold text-black transition-colors hover:bg-[#FFBE55]"
          >
            좌우 비교 열기
          </button>
          <button
            type="button"
            onClick={() => setCompareIds([])}
            aria-label="비교 슬롯 비우기"
            className="text-[#C8C4BC] hover:text-[#FAF7F0]"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Dark-Glass 64vh Theater Lightbox */}
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
          onSelectItem={handleOpenDetail}
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
          onOpenDetail={handleOpenDetail}
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
