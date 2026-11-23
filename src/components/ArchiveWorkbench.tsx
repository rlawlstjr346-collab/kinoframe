"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ArchiveItem, AspectRatio } from "@/types/archive";
import { getCanonicalMediaKey } from "@/lib/canonical-media";
import { globalVideoScheduler } from "@/lib/video-scheduler";
import { searchArchiveItems } from "@/lib/search";
import { EyecandyHeader } from "@/components/EyecandyHeader";
import { SlideMountCard } from "@/components/SlideMountCard";
import { ViewfinderModal } from "@/components/ViewfinderModal";

interface ArchiveWorkbenchProps {
  items: ArchiveItem[];
}

const SEEN_STORAGE_KEY = "kinoframe_seen_v1";
const MAX_SEEN_IDS = 450;
const AUTO_RESET_UNSEEN_THRESHOLD = 20;
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
    return parsed
      .filter((x): x is string => typeof x === "string")
      .slice(-MAX_SEEN_IDS);
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

export function ArchiveWorkbench({ items }: ArchiveWorkbenchProps) {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q")?.trim() || "";

  const [columnCount, setColumnCount] = useState<number>(5);
  const [scrolled, setScrolled] = useState<boolean>(false);
  const [shuffledOrderIds, setShuffledOrderIds] = useState<string[] | null>(
    null
  );
  const [rawSearch, setRawSearch] = useState<string>(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState<string>(initialQuery);
  const [searchLookupItems, setSearchLookupItems] = useState<ArchiveItem[]>([]);
  const [evictedIds, setEvictedIds] = useState<Set<string>>(() => new Set());
  const [visibleCount, setVisibleCount] = useState<number>(WALL_PAGE_STEP);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);

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

  // Hydration-safe Unseen-First Fisher-Yates shuffle on client mount
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

  // Deep full-catalog search via /api/archive/lookup?q=... when searching
  useEffect(() => {
    const q = debouncedQuery.trim();
    if (q.length < 2) {
      setSearchLookupItems([]);
      return;
    }
    const ctrl = new AbortController();
    fetch(`/api/archive/lookup?q=${encodeURIComponent(q)}`, {
      signal: ctrl.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { items?: ArchiveItem[] } | null) => {
        if (data && Array.isArray(data.items)) {
          setSearchLookupItems(data.items);
        }
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [debouncedQuery]);

  // Deduplicated master catalog (active wall + deep search lookup hits)
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
    for (const entry of searchLookupItems) appendUnique(entry);
    return out;
  }, [items, searchLookupItems, evictedIds]);

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

  // Record viewed IDs for Unseen-First randomization
  useEffect(() => {
    if (!shuffledOrderIds || debouncedQuery) return;
    if (visibleItems.length > 0) {
      appendSeenIds(visibleItems.map((entry) => entry.id));
    }
  }, [visibleItems, shuffledOrderIds, debouncedQuery]);

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

  const handleShuffleWall = useCallback(() => {
    setShuffledOrderIds(
      fisherYatesShuffle(allCatalogItems.map((entry) => entry.id))
    );
    setVisibleCount(WALL_PAGE_STEP);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [allCatalogItems]);

  const handleLogoClick = useCallback(() => {
    setRawSearch("");
    setDebouncedQuery("");
    setSelectedItemId(null);
    setShuffledOrderIds(
      fisherYatesShuffle(allCatalogItems.map((entry) => entry.id))
    );
    setVisibleCount(WALL_PAGE_STEP);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [allCatalogItems]);

  const handleSearchSubmit = useCallback(() => {
    setDebouncedQuery(rawSearch.trim());
    setVisibleCount(WALL_PAGE_STEP);
  }, [rawSearch]);

  const handleOpenDetail = useCallback((item: ArchiveItem) => {
    setSelectedItemId(item.id);
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
