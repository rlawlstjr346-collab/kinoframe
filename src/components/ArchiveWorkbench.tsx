"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type {
  ArchiveItem,
  AspectRatio,
  AuthSessionState,
  VaultState,
} from "@/types/archive";
import { parseBoardIds, serializeBoardIds } from "@/lib/taxonomy";
import {
  DEFAULT_VAULT_STATE,
  exportVaultToFile,
  isConduitItemId,
  isValidArchiveItemId,
  loadAccountVault,
  loadConduitSavedItems,
  parseImportedVaultJson,
  removeConduitSavedItem,
  saveAccountVault,
  saveConduitSavedItem,
} from "@/lib/vault";
import { getCanonicalMediaKey } from "@/lib/canonical-media";
import { globalVideoScheduler } from "@/lib/video-scheduler";
import { searchItemByQuery } from "@/lib/visual-techniques";
import { EyecandyHeader } from "@/components/EyecandyHeader";
import { SlideMountCard } from "@/components/SlideMountCard";
import { ViewfinderModal } from "@/components/ViewfinderModal";
import { MoodboardDrawer } from "@/components/MoodboardDrawer";
import { AuthModal } from "@/components/AuthModal";
import { BoardBookmarkIcon, CloseIcon } from "@/components/Icons";

interface ArchiveWorkbenchProps {
  items: ArchiveItem[];
  initialSeed?: number;
  disableConduit?: boolean;
}

const SEEN_STORAGE_KEY = "kinoframe_seen_v1";
const MAX_SEEN_IDS = 450;
const AUTO_RESET_UNSEEN_THRESHOLD = 20;
const WALL_PAGE_STEP = 40;

const ASPECT_HEIGHT_WEIGHT: Record<AspectRatio, number> = {
  "4:5": 0.75,
  "4:3": 0.75,
  "3:2": 0.667,
  "16:9": 0.5625,
  "2.39:1": 0.418,
};

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

function fisherYatesShuffle<T>(arr: readonly T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

function loadSeenIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SEEN_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string").slice(-MAX_SEEN_IDS);
  } catch {
    return [];
  }
}

function appendSeenIds(newIds: readonly string[]): void {
  if (typeof window === "undefined" || newIds.length === 0) return;
  try {
    const current = loadSeenIds();
    const seenSet = new Set(current);
    const merged = [...current];
    for (const id of newIds) {
      if (!seenSet.has(id)) {
        seenSet.add(id);
        merged.push(id);
      }
    }
    window.localStorage.setItem(
      SEEN_STORAGE_KEY,
      JSON.stringify(merged.slice(-MAX_SEEN_IDS))
    );
  } catch {
    // ignore storage quota errors
  }
}

/**
 * Unseen-First Fisher-Yates Shuffle:
 * Places [unseen + newly harvested clips] in random order FIRST, followed by seen clips.
 * Automatically resets `kinoframe_seen_v1` when fewer than 20 unseen clips remain.
 */
function buildUnseenFirstOrder(allIds: readonly string[]): string[] {
  const seenList = loadSeenIds();
  const seenSet = new Set(seenList);

  const unseen: string[] = [];
  const seen: string[] = [];
  for (const id of allIds) {
    if (seenSet.has(id)) {
      seen.push(id);
    } else {
      unseen.push(id);
    }
  }

  if (allIds.length >= 25 && unseen.length < AUTO_RESET_UNSEEN_THRESHOLD) {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(SEEN_STORAGE_KEY);
      } catch {
        // ignore
      }
    }
    return fisherYatesShuffle(allIds);
  }

  return [...fisherYatesShuffle(unseen), ...fisherYatesShuffle(seen)];
}

function parseRawBoardParamIds(param: string | null | undefined): string[] {
  if (!param) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of param.split(",")) {
    const clean = part.trim();
    if (clean && isValidArchiveItemId(clean) && !seen.has(clean)) {
      seen.add(clean);
      out.push(clean);
    }
  }
  return out;
}

export function ArchiveWorkbench({
  items,
  initialSeed = 424242,
  disableConduit = false,
}: ArchiveWorkbenchProps) {
  const searchParams = useSearchParams();
  const [columnCount, setColumnCount] = useState<number>(5);
  const [scrolled, setScrolled] = useState<boolean>(false);

  // Unseen-First random wall state (hydration-safe: null during SSR, randomized on client mount)
  const [shuffledOrderIds, setShuffledOrderIds] = useState<string[] | null>(
    null
  );
  const [rawSearch, setRawSearch] = useState<string>("");
  const [debouncedQuery, setDebouncedQuery] = useState<string>("");

  // Archived board clips & deep full-catalog search results via /api/archive/lookup
  const [archivedLookupItems, setArchivedLookupItems] = useState<ArchiveItem[]>(
    []
  );
  const [searchLookupItems, setSearchLookupItems] = useState<ArchiveItem[]>([]);

  // Conduit & dead-tile eviction states
  const [savedConduitItems, setSavedConduitItems] = useState<ArchiveItem[]>([]);
  const [conduitItems, setConduitItems] = useState<ArchiveItem[]>([]);
  const [evictedIds, setEvictedIds] = useState<Set<string>>(() => new Set());
  const [conduitLoading, setConduitLoading] = useState<boolean>(false);
  const [conduitHasMore, setConduitHasMore] = useState<boolean>(
    !disableConduit
  );

  const isShortLoopCatalog = useMemo(
    () =>
      items.length > 0 &&
      items.every(
        (entry) =>
          entry.mediaSource === "archive_mp4" &&
          entry.durationSec !== null &&
          entry.durationSec <= 6
      ),
    [items]
  );

  // Unlock 20 simultaneous desktop slots (mobile 6) for ultra-light HD loops
  useEffect(() => {
    if (!isShortLoopCatalog) {
      globalVideoScheduler.setMaxSlotsOverride(null);
      return;
    }
    const syncSlotCap = () => {
      const cap =
        typeof window !== "undefined" && window.innerWidth < 768 ? 6 : 20;
      globalVideoScheduler.setMaxSlotsOverride(cap);
    };
    syncSlotCap();
    window.addEventListener("resize", syncSlotCap, { passive: true });
    return () => {
      window.removeEventListener("resize", syncSlotCap);
      globalVideoScheduler.setMaxSlotsOverride(null);
    };
  }, [isShortLoopCatalog]);

  const didInitRef = useRef<boolean>(false);
  const inFlightCursorRef = useRef<number | null>(null);
  const nextCursorRef = useRef<number>(1);
  const exhaustedRef = useRef<boolean>(false);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const fetchedArchivedIdsRef = useRef<Set<string>>(new Set());

  // Canonical deduplicated master catalog (active wall + restored archived board items + search lookup + conduit)
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
    for (const entry of archivedLookupItems) appendUnique(entry);
    for (const entry of searchLookupItems) appendUnique(entry);
    for (const entry of savedConduitItems) appendUnique(entry);
    for (const entry of conduitItems) appendUnique(entry);
    return out;
  }, [
    items,
    archivedLookupItems,
    searchLookupItems,
    savedConduitItems,
    conduitItems,
    evictedIds,
  ]);

  const validIdSet = useMemo(
    () => new Set(allCatalogItems.map((i) => i.id)),
    [allCatalogItems]
  );

  // Capture ?board= ONLY from initial page load so saving your own clips never triggers the "shared board link" banner
  const [initialBoardParam] = useState<string | null>(() =>
    searchParams.get("board")
  );
  const rawInitialBoardIds = useMemo(
    () => parseRawBoardParamIds(initialBoardParam),
    [initialBoardParam]
  );
  const initialBoardIds = useMemo(
    () => parseBoardIds(initialBoardParam, validIdSet),
    [initialBoardParam, validIdSet]
  );

  const [boardIds, setBoardIds] = useState<string[]>(() =>
    rawInitialBoardIds.length > 0
      ? rawInitialBoardIds
      : parseBoardIds(
          searchParams.get("board"),
          new Set(items.map((i) => i.id))
        )
  );
  const [boardOnly, setBoardOnly] = useState<boolean>(false);
  const [visibleCount, setVisibleCount] = useState<number>(WALL_PAGE_STEP);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
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

  // Trigger hydration-safe Unseen-First Fisher-Yates shuffle on client mount
  useEffect(() => {
    setShuffledOrderIds(buildUnseenFirstOrder(items.map((entry) => entry.id)));
  }, [items]);

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

  // Permanently restore any archived board / ?board= IDs from catalog-full.json via /api/archive/lookup
  useEffect(() => {
    const needed = Array.from(
      new Set([
        ...boardIds,
        ...rawInitialBoardIds,
        ...vault.bookmarks.map((b) => b.itemId),
      ])
    ).filter(
      (id) =>
        isValidArchiveItemId(id) &&
        !validIdSet.has(id) &&
        !fetchedArchivedIdsRef.current.has(id)
    );

    if (needed.length === 0) return;
    for (const id of needed) fetchedArchivedIdsRef.current.add(id);

    let cancelled = false;
    fetch(`/api/archive/lookup?ids=${encodeURIComponent(needed.join(","))}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { items?: ArchiveItem[] } | null) => {
        if (cancelled || !data || !Array.isArray(data.items)) return;
        if (data.items.length > 0) {
          setArchivedLookupItems((prev) => {
            const byId = new Map(prev.map((x) => [x.id, x]));
            for (const item of data.items!) byId.set(item.id, item);
            return Array.from(byId.values());
          });
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [boardIds, rawInitialBoardIds, vault.bookmarks, validIdSet]);

  // Deep keyword lookup across full catalog (up to 10,000 clips) when searching
  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setSearchLookupItems([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/archive/lookup?q=${encodeURIComponent(debouncedQuery)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { items?: ArchiveItem[] } | null) => {
        if (cancelled || !data || !Array.isArray(data.items)) return;
        setSearchLookupItems(data.items);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  const rawInitialBoardIdsRef = useRef<string[]>(rawInitialBoardIds);
  rawInitialBoardIdsRef.current = rawInitialBoardIds;

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

    const sharedIds = rawInitialBoardIdsRef.current;
    const accountBoardIds = resolved.bookmarks
      .map((b) => b.itemId)
      .filter((id) => isValidArchiveItemId(id) || isConduitItemId(id));

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

  const handleOpenDetail = useCallback((target: ArchiveItem) => {
    appendSeenIds([target.id]);
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

  // Unseen-First Fisher-Yates randomized order
  const orderedSeedItems = useMemo(() => {
    const cleanSeed = items.filter((i) => !evictedIds.has(i.id));
    if (!shuffledOrderIds) {
      return cleanSeed;
    }
    const byId = new Map(cleanSeed.map((entry) => [entry.id, entry]));
    const out: ArchiveItem[] = [];
    const placed = new Set<string>();
    for (const id of shuffledOrderIds) {
      const found = byId.get(id);
      if (found) {
        out.push(found);
        placed.add(id);
      }
    }
    for (const entry of cleanSeed) {
      if (!placed.has(entry.id)) out.push(entry);
    }
    return out;
  }, [items, evictedIds, shuffledOrderIds]);

  // Deduplicated pool (active wall + archived board items when boardOnly + full-archive lookup when searching)
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
      for (const entry of archivedLookupItems) pushUnique(entry);
      for (const entry of savedConduitItems) pushUnique(entry);
    }
    if (debouncedQuery.length >= 2) {
      for (const entry of searchLookupItems) pushUnique(entry);
    }
    for (const entry of conduitItems) pushUnique(entry);

    return baseList.filter((item) => {
      if (boardOnly && !boardIds.includes(item.id)) return false;
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
    archivedLookupItems,
    searchLookupItems,
    savedConduitItems,
    conduitItems,
    evictedIds,
    boardOnly,
    boardIds,
    debouncedQuery,
  ]);

  const visibleItems = useMemo(
    () => displayedPool.slice(0, Math.max(WALL_PAGE_STEP, visibleCount)),
    [displayedPool, visibleCount]
  );

  // Record exposed clips to kinoframe_seen_v1 after client shuffle so subsequent visits/shuffles show unseen clips first
  useEffect(() => {
    if (!shuffledOrderIds || visibleItems.length === 0) return;
    const timer = window.setTimeout(() => {
      appendSeenIds(visibleItems.map((entry) => entry.id));
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [shuffledOrderIds, visibleItems]);

  const masonryColumns = useMemo(
    () => distributeToColumns(visibleItems, columnCount),
    [visibleItems, columnCount]
  );

  const hasMoreItems = visibleItems.length < displayedPool.length;
  const canLoadConduit = !disableConduit && !boardOnly && conduitHasMore;

  const fetchNextConduitPage = useCallback(async () => {
    if (
      disableConduit ||
      boardOnly ||
      exhaustedRef.current ||
      inFlightCursorRef.current !== null
    ) {
      return;
    }

    const targetCursor = nextCursorRef.current;
    inFlightCursorRef.current = targetCursor;
    setConduitLoading(true);

    try {
      const qs = new URLSearchParams({
        category: "ALL",
        country: "ALL",
        decade: "ALL",
        mediaMode: "MOTION",
        cursor: String(targetCursor),
        seed: String(initialSeed),
      });
      if (debouncedQuery) {
        qs.set("q", debouncedQuery);
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
  }, [disableConduit, boardOnly, debouncedQuery, items, initialSeed]);

  // 40-card progressive infinite scroll (rootMargin: 900px for seamless 60fps loading)
  useEffect(() => {
    if (!hasMoreItems && !canLoadConduit) return;
    const node = loadMoreSentinelRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setVisibleCount((prev) => {
          const next = Math.min(displayedPool.length, prev + WALL_PAGE_STEP);
          if (next >= displayedPool.length - 18) {
            void fetchNextConduitPage();
          }
          return next;
        });
      },
      { rootMargin: "900px 0px" }
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
    return (
      allCatalogItems.find((i) => i.id === selectedItemId) ??
      displayedPool.find((i) => i.id === selectedItemId) ??
      null
    );
  }, [allCatalogItems, displayedPool, selectedItemId]);

  const selectedBookmark = useMemo(() => {
    if (!selectedItemId) return undefined;
    return vault.bookmarks.find((b) => b.itemId === selectedItemId);
  }, [vault.bookmarks, selectedItemId]);

  // Logo click: scroll to top + clear search/board filter + Unseen-First Fisher-Yates shuffle
  const handleLogoClick = useCallback(() => {
    setBoardOnly(false);
    setRawSearch("");
    setDebouncedQuery("");
    setVisibleCount(WALL_PAGE_STEP);
    setShuffledOrderIds(buildUnseenFirstOrder(items.map((entry) => entry.id)));
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [items]);

  // Header ↻ button: fresh Unseen-First Fisher-Yates shuffle
  const handleShuffleWall = useCallback(() => {
    setVisibleCount(WALL_PAGE_STEP);
    setShuffledOrderIds(buildUnseenFirstOrder(items.map((entry) => entry.id)));
  }, [items]);

  const handleSearchSubmit = useCallback(() => {
    setDebouncedQuery(rawSearch.trim());
  }, [rawSearch]);

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

  const ensureSavedToBoard = useCallback(
    (id: string, folderId?: string) => {
      const targetItem = allCatalogItems.find((entry) => entry.id === id);
      if (isConduitItemId(id) && targetItem) {
        setSavedConduitItems(saveConduitSavedItem(targetItem));
      }
      setBoardIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
      setVault((prev) => {
        if (prev.bookmarks.some((b) => b.itemId === id)) return prev;
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

  const handleAuthSuccess = useCallback(
    async (nextSession: AuthSessionState) => {
      const queuedSave = pendingSave;
      setPendingSave(null);
      setSession(nextSession);
      if (nextSession.authenticated && nextSession.user) {
        await hydrateAccountVault(nextSession.user.sub);
        if (queuedSave) {
          ensureSavedToBoard(queuedSave.itemId, queuedSave.folderId);
        }
      }
    },
    [hydrateAccountVault, pendingSave, ensureSavedToBoard]
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

  const sharedRestoreCount = Math.max(
    initialBoardIds.length,
    rawInitialBoardIds.length
  );

  return (
    <div className="flex min-h-screen flex-col bg-[#0A0B0E] text-[#F2EFE9]">
      <EyecandyHeader
        scrolled={scrolled}
        searchQuery={rawSearch}
        onSearchChange={setRawSearch}
        onSearchSubmit={handleSearchSubmit}
        session={session}
        savedCount={boardIds.length}
        onLogoClick={handleLogoClick}
        onShuffleWall={handleShuffleWall}
        onOpenBoard={() => setBoardOpen(true)}
        onOpenAuth={() => setAuthOpen(true)}
        onLogout={handleLogout}
      />

      <main className="w-full flex-1 pt-[clamp(66px,4.2vw,88px)]">
        {/* Shared ?board= Restoration Banner */}
        {sharedRestoreCount > 0 && !sharedBannerDismissed && (
          <div className="mx-4 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-[16px] border border-[#C89E52]/50 bg-[#C89E52]/10 px-5 py-2.5 text-[0.9rem] lg:mx-8">
            <div className="flex items-center gap-2 text-[#F2EFE9]">
              <BoardBookmarkIcon className="h-4 w-4 text-[#C89E52]" filled />
              <span>
                공유 보드 링크에서 <strong>{sharedRestoreCount}개</strong>의
                아카이브가 열렸습니다.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setBoardOnly((prev) => !prev)}
                className="rounded-full border border-[#C89E52] bg-[#0A0B0E] px-3.5 py-1 text-[0.8rem] font-semibold text-[#C89E52] hover:bg-[#C89E52]/15"
              >
                {boardOnly ? "전체 보기" : "공유 컷만 보기"}
              </button>
              <button
                type="button"
                onClick={() => setBoardOpen(true)}
                className="rounded-full bg-[#C89E52] px-3.5 py-1 text-[0.8rem] font-bold text-[#0A0B0E] hover:bg-[#D9B36A]"
              >
                보드 열기
              </button>
              <button
                type="button"
                onClick={() => setSharedBannerDismissed(true)}
                aria-label="알림 닫기"
                className="p-1 text-[#C8C4BC] hover:text-[#F2EFE9]"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* IMMEDIATE UNSEEN-FIRST PURE RANDOM 5-COLUMN ZERO-CHROME HD VIDEO WALL */}
        <div className="w-full px-3 pb-14 sm:px-4 lg:px-6">
          {displayedPool.length > 0 ? (
            <>
              <section
                aria-label="시네마·TVCF 무빙 아카이브 월"
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
                      className="inline-flex h-9 items-center gap-2 rounded-full border border-[#C89E52]/50 bg-[#111318] px-5 font-mono text-[12px] tracking-wider text-[#C8C4BC]"
                    >
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#C89E52]" />
                      <span>STREAMING ARCHIVE CONDUIT</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (hasMoreItems) {
                          setVisibleCount((prev) =>
                            Math.min(
                              displayedPool.length,
                              prev + WALL_PAGE_STEP
                            )
                          );
                        } else {
                          void fetchNextConduitPage();
                        }
                      }}
                      className="inline-flex items-center justify-center rounded-full border border-[#C89E52] bg-[#0A0B0E] px-9 py-2 text-[0.9rem] font-semibold uppercase tracking-wider text-[#F2EFE9] transition-colors duration-200 hover:bg-[#C89E52] hover:text-[#0A0B0E]"
                    >
                      Load more
                    </button>
                  )}
                </div>
              )}
            </>
          ) : (
            <section className="flex flex-col items-center justify-center rounded-[16px] border border-white/15 bg-[#111318] px-6 py-24 text-center">
              <h2 className="text-[1.4rem] font-semibold text-[#F2EFE9]">
                일치하는 무빙 클립이 없습니다
              </h2>
              <p className="mt-2 text-[0.95rem] text-[#7E7B74]">
                검색어를 바꾸거나 전체 무작위 월로 돌아가세요.
              </p>
              <button
                type="button"
                onClick={handleLogoClick}
                className="mt-6 rounded-full bg-[#C89E52] px-7 py-2 text-[0.9rem] font-semibold uppercase text-[#0A0B0E] transition-colors hover:bg-[#D9B36A]"
              >
                Reset Wall
              </button>
            </section>
          )}
        </div>
      </main>

      {/* Minimal Obsidian Footer */}
      <footer className="border-t border-white/[0.08] bg-[#0A0B0E] py-5">
        <div className="mx-auto flex w-full flex-col items-start justify-between gap-2 px-6 font-mono text-[12px] text-[#7E7B74] sm:flex-row sm:items-center lg:px-8">
          <span className="text-[#C89E52]">
            KINOFRAME. · CINEMA &amp; TVCF MOVING ARCHIVE
          </span>
          <span>Anodized Darkroom Reference Wall</span>
        </div>
      </footer>

      {/* Fluid FHD/QHD/4K Dark-Glass Theater Modal */}
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
                    Math.max(prev, nextIdx + WALL_PAGE_STEP)
                  )
                );
              }
            }
          }}
          onSelectItem={handleOpenDetail}
          onToggleBoard={handleToggleBoard}
          onSaveToVault={handleSaveToVault}
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

      {/* Honest Account / Configured OAuth Login Modal (z-[140], only when logged out) */}
      {authOpen && !session.authenticated && (
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
