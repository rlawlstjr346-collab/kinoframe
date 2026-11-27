"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ArchiveItem, AspectRatio } from "@/types/archive";
import { getCanonicalMediaKey } from "@/lib/canonical-media";
import { globalVideoScheduler } from "@/lib/video-scheduler";
import { searchArchiveItems } from "@/lib/search";
import { normalizeCatalogPayload } from "@/lib/catalog-payload";
import {
  TOP_DECK_SIZE,
  buildImpressionDeckOrder,
  loadImpressionDeckState,
  recordImpressionsInState,
  saveImpressionDeckState,
} from "@/lib/impression-deck";
import { EyecandyHeader } from "@/components/EyecandyHeader";
import { SlideMountCard } from "@/components/SlideMountCard";
import { ViewfinderModal } from "@/components/ViewfinderModal";

interface ArchiveWorkbenchProps {
  items: ArchiveItem[];
}

const WALL_PAGE_STEP = 48;

const ASPECT_HEIGHT_WEIGHT: Record<AspectRatio, number> = {
  "4:5": 0.75,
  "4:3": 0.75,
  "3:2": 0.667,
  "16:9": 0.5625,
  "2.39:1": 0.418,
};

function getItemHeightWeight(item: ArchiveItem): number {
  if (
    typeof item.width === "number" &&
    typeof item.height === "number" &&
    item.width > 0 &&
    item.height > 0
  ) {
    return item.height / item.width;
  }
  return ASPECT_HEIGHT_WEIGHT[item.aspectRatio] ?? 0.5625;
}

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
    heights[minIdx] += getItemHeightWeight(item);
  }

  return cols;
}

let fullCatalogPromise: Promise<ArchiveItem[]> | null = null;

function loadFullCatalogOnce(): Promise<ArchiveItem[]> {
  fullCatalogPromise ??= fetch("/api/archive/full")
    .then((res) => {
      if (!res.ok) throw new Error(`catalog ${res.status}`);
      return res.json();
    })
    .then((json) => normalizeCatalogPayload(json));
  // Failed downloads are retried on the next query instead of being cached.
  fullCatalogPromise.catch(() => {
    fullCatalogPromise = null;
  });
  return fullCatalogPromise;
}

export function ArchiveWorkbench({ items }: ArchiveWorkbenchProps) {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q")?.trim() || "";

  const [liveItems, setLiveItems] = useState<ArchiveItem[]>(items);
  const [columnCount, setColumnCount] = useState<number>(5);
  const [scrolled, setScrolled] = useState<boolean>(false);
  const [shuffledOrderIds, setShuffledOrderIds] = useState<string[] | null>(
    null
  );
  const [deckEpoch, setDeckEpoch] = useState<number>(0);
  const [shuffleTick, setShuffleTick] = useState<number>(0);
  const [rawSearch, setRawSearch] = useState<string>(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState<string>(initialQuery);
  const [searchLookupItems, setSearchLookupItems] = useState<ArchiveItem[]>([]);
  const [evictedIds, setEvictedIds] = useState<Set<string>>(() => new Set());
  const [visibleCount, setVisibleCount] = useState<number>(WALL_PAGE_STEP);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const deckInitializedRef = useRef<boolean>(false);
  const visibleItemsRef = useRef<ArchiveItem[]>([]);
  const liveItemsRef = useRef<ArchiveItem[]>(items);

  useEffect(() => {
    setLiveItems(items);
    liveItemsRef.current = items;
  }, [items]);

  const isShortLoopCatalog = useMemo(
    () =>
      liveItems.length > 0 &&
      liveItems.every(
        (entry) =>
          entry.mediaSource === "archive_mp4" &&
          entry.durationSec !== null &&
          entry.durationSec <= 6
      ),
    [liveItems]
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

  // Hydration-safe Impression Deck build on initial client mount (0% overlap with lastDeckIds)
  useEffect(() => {
    if (deckInitializedRef.current || liveItems.length === 0) return;
    deckInitializedRef.current = true;
    const state = loadImpressionDeckState();
    const { orderedIds, nextState } = buildImpressionDeckOrder(liveItems, state);
    saveImpressionDeckState(nextState);
    setShuffledOrderIds(orderedIds);
    setDeckEpoch((prev) => prev + 1);
  }, [liveItems]);

  // Background fresh wall sync from /api/archive/wall (Cache-Control: no-store)
  const syncLatestWallPool = useCallback(async (): Promise<ArchiveItem[] | null> => {
    try {
      const res = await fetch("/api/archive/wall", {
        cache: "no-store",
      });
      if (!res.ok) return null;
      const fresh = normalizeCatalogPayload(await res.json());
      if (fresh.length > 0) {
        liveItemsRef.current = fresh;
        setLiveItems(fresh);
        return fresh;
      }
    } catch {
      // keep existing catalog seamlessly
    }
    return null;
  }, []);

  // Responsive 5 / 3 / 2 column sync on mount and resize
  useEffect(() => {
    const syncLayout = () => {
      const nextCols = getResponsiveColumnCount(window.innerWidth);
      setColumnCount((prev) => (prev === nextCols ? prev : nextCols));
    };
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled((prev) => {
        const next = y > 16;
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

  // Debounce search input (160ms for instant feel)
  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedQuery(rawSearch.trim());
    }, 160);
    return () => window.clearTimeout(t);
  }, [rawSearch]);

  // Deep full-catalog search: the full catalog is downloaded once (/api/archive/full, streamed)
  // and searched in the browser with the same matcher /api/archive/lookup uses (top 120 hits).
  useEffect(() => {
    const q = debouncedQuery.trim();
    if (q.length < 2) {
      setSearchLookupItems([]);
      return;
    }
    let cancelled = false;
    loadFullCatalogOnce()
      .then((catalog) => {
        if (!cancelled) setSearchLookupItems(searchArchiveItems(catalog, q).slice(0, 120));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  // Deduplicated master catalog (live active wall + deep search lookup hits)
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
    for (const entry of liveItems) appendUnique(entry);
    for (const entry of searchLookupItems) appendUnique(entry);
    return out;
  }, [liveItems, searchLookupItems, evictedIds]);

  const orderedBaseItems = useMemo(() => {
    if (!shuffledOrderIds) {
      return allCatalogItems;
    }
    const byId = new Map(allCatalogItems.map((entry) => [entry.id, entry]));
    const out: ArchiveItem[] = [];
    const used = new Set<string>();
    for (const id of shuffledOrderIds) {
      const entry = byId.get(id);
      if (entry && !used.has(entry.id)) {
        used.add(entry.id);
        out.push(entry);
      }
    }
    for (const entry of allCatalogItems) {
      if (!used.has(entry.id)) {
        used.add(entry.id);
        out.push(entry);
      }
    }
    return out;
  }, [allCatalogItems, shuffledOrderIds]);

  // Unified multilingual, phonetic, Choseong, thesaurus & typo-tolerant search
  const displayedPool = useMemo(() => {
    const q = debouncedQuery.trim();
    if (!q) return orderedBaseItems;
    return searchArchiveItems(orderedBaseItems, q);
  }, [orderedBaseItems, debouncedQuery]);

  const visibleItems = useMemo(
    () => displayedPool.slice(0, visibleCount),
    [displayedPool, visibleCount]
  );

  useEffect(() => {
    visibleItemsRef.current = visibleItems;
  }, [visibleItems]);

  const hasMoreItems = visibleCount < displayedPool.length;

  // Automatic infinite scroll for large catalogs (up to 600 active clips)
  useEffect(() => {
    if (!hasMoreItems) return;
    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((prev) =>
            Math.min(displayedPool.length, prev + WALL_PAGE_STEP)
          );
        }
      },
      { rootMargin: "320px 0px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMoreItems, displayedPool.length]);

  const masonryColumns = useMemo(
    () => distributeToColumns(visibleItems, columnCount),
    [visibleItems, columnCount]
  );

  const selectedItem = useMemo(
    () =>
      selectedItemId
        ? allCatalogItems.find((entry) => entry.id === selectedItemId) ?? null
        : null,
    [allCatalogItems, selectedItemId]
  );

  const selectedIndex = useMemo(
    () =>
      selectedItemId
        ? displayedPool.findIndex((entry) => entry.id === selectedItemId)
        : -1,
    [displayedPool, selectedItemId]
  );

  const handleEvictItem = useCallback((id: string) => {
    setEvictedIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  // Automatic >= 35% / >= 900ms viewport dwell impression logger
  const handleCardImpression = useCallback((id: string) => {
    const current = loadImpressionDeckState();
    const updated = recordImpressionsInState(current, [id], Date.now());
    saveImpressionDeckState(updated);
  }, []);

  // Rotate to 100% fresh non-overlapping 40-cut deck + sync latest /api/archive/wall in background
  const rotateFreshDeck = useCallback(
    (clearSearch: boolean) => {
      if (clearSearch) {
        setRawSearch("");
        setDebouncedQuery("");
        setSelectedItemId(null);
      }
      const currentTopIds = visibleItemsRef.current
        .slice(0, TOP_DECK_SIZE)
        .map((entry) => entry.id);

      const currentState = loadImpressionDeckState();
      const recordedState = recordImpressionsInState(
        {
          ...currentState,
          lastDeckIds:
            currentTopIds.length > 0 ? currentTopIds : currentState.lastDeckIds,
        },
        currentTopIds,
        Date.now()
      );

      const pool = liveItemsRef.current.filter((e) => !evictedIds.has(e.id));
      const { orderedIds, nextState } = buildImpressionDeckOrder(
        pool,
        recordedState
      );
      saveImpressionDeckState(nextState);
      setShuffledOrderIds(orderedIds);
      setDeckEpoch((prev) => prev + 1);
      setVisibleCount(WALL_PAGE_STEP);

      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }

      // Sync latest GitHub Releases pool in background for next deck / newly added clips
      void syncLatestWallPool();
    },
    [evictedIds, syncLatestWallPool]
  );

  const handleShuffleWall = useCallback(() => {
    rotateFreshDeck(true);
  }, [rotateFreshDeck]);

  const handleLogoClick = useCallback(() => {
    rotateFreshDeck(true);
  }, [rotateFreshDeck]);

  // Keyboard shortcut `R` (outside inputs & when modal is closed) -> trigger '새로운 컷'
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key !== "r" && e.key !== "R") return;
      if (selectedItemId) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      setShuffleTick((t) => t + 1);
      rotateFreshDeck(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [rotateFreshDeck, selectedItemId]);

  const handleSearchSubmit = useCallback(() => {
    setDebouncedQuery(rawSearch.trim());
    setVisibleCount(WALL_PAGE_STEP);
  }, [rawSearch]);

  const handleOpenDetail = useCallback((item: ArchiveItem) => {
    setSelectedItemId(item.id);
    const current = loadImpressionDeckState();
    saveImpressionDeckState(recordImpressionsInState(current, [item.id], Date.now()));
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-[#000000] text-white">
      <EyecandyHeader
        scrolled={scrolled}
        searchQuery={rawSearch}
        onSearchChange={(val) => {
          setRawSearch(val);
          setVisibleCount(WALL_PAGE_STEP);
        }}
        onSearchSubmit={handleSearchSubmit}
        onLogoClick={handleLogoClick}
        onShuffleWall={handleShuffleWall}
        shuffleTick={shuffleTick}
      />

      <main className="w-full flex-1 pt-[clamp(68px,4.3vw,88px)]">
        {/* 5-Column Zero-Chrome HD Moving Reference Wall */}
        <div className="w-full px-3 pb-14 sm:px-4 lg:px-6">
          {displayedPool.length > 0 ? (
            <>
              <section
                aria-label="시네마·TVCF 무빙 아카이브 월"
                className="grid grid-cols-2 items-start gap-x-[8px] md:grid-cols-3 lg:grid-cols-5"
              >
                {masonryColumns.map((colItems, colIdx) => (
                  <div
                    key={`col-${colIdx}`}
                    className="flex min-w-0 flex-col gap-y-[8px]"
                  >
                    {colItems.map((item) => (
                      <SlideMountCard
                        key={item.id}
                        item={item}
                        onOpenDetail={handleOpenDetail}
                        onEvictItem={handleEvictItem}
                        onImpression={handleCardImpression}
                        deckEpoch={deckEpoch}
                      />
                    ))}
                  </div>
                ))}
              </section>

              {hasMoreItems && (
                <div
                  ref={loadMoreSentinelRef}
                  className="mt-8 flex items-center justify-center py-4"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setVisibleCount((prev) =>
                        Math.min(displayedPool.length, prev + WALL_PAGE_STEP)
                      )
                    }
                    className="inline-flex h-10 items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.08] px-7 text-[14px] font-medium text-white backdrop-blur-xl transition-colors hover:bg-white/[0.16]"
                  >
                    더 보기
                  </button>
                </div>
              )}
            </>
          ) : (
            <section className="mx-auto mt-10 flex max-w-lg flex-col items-center justify-center rounded-[28px] border border-white/[0.10] bg-[#1C1C1E]/85 px-6 py-20 text-center backdrop-blur-2xl">
              <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-white">
                일치하는 클립이 없습니다
              </h2>
              <p className="mt-2 text-[15px] text-[#98989D]">
                작품명, 감독, 브랜드, 초성 또는 연출 기법으로 다시 검색해 보세요.
              </p>
              <button
                type="button"
                onClick={handleLogoClick}
                className="mt-6 inline-flex h-10 items-center rounded-full bg-white px-6 text-[14px] font-semibold text-[#111111] transition-colors hover:bg-white/90"
              >
                전체 월로 돌아가기
              </button>
            </section>
          )}
        </div>
      </main>

      {/* Minimal Pure Black Footer */}
      <footer className="border-t border-white/[0.08] bg-[#000000] py-5">
        <div className="mx-auto flex w-full flex-col items-start justify-between gap-2 px-6 text-[12px] tracking-[-0.01em] text-[#98989D] sm:flex-row sm:items-center lg:px-8">
          <span className="font-medium text-white/80">
            KINOFRAME · Cinema &amp; TVCF Moving Reference Archive
          </span>
          <span>1080p HD Cinema &amp; Archival Commercial Wall</span>
        </div>
      </footer>

      {/* Concentric Apple Dark-Glass Theater Modal */}
      {selectedItem && (
        <ViewfinderModal
          item={selectedItem}
          hasPrev={selectedIndex > 0}
          hasNext={
            selectedIndex >= 0 && selectedIndex < displayedPool.length - 1
          }
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
        />
      )}
    </div>
  );
}
