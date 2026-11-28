"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ArchiveItem } from "@/types/archive";
import { getVisibleAspect } from "@/lib/media-crop";
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
import { parseBoardIds } from "@/lib/taxonomy";
import { boardActions, useBoardIds } from "@/lib/board-store";
import { EyecandyHeader } from "@/components/EyecandyHeader";
import { SlideMountCard } from "@/components/SlideMountCard";
import { ViewfinderModal } from "@/components/ViewfinderModal";
import { BoardDrawer } from "@/components/BoardDrawer";
import { WallFilterBar, type WallCategory } from "@/components/WallFilterBar";

interface ArchiveWorkbenchProps {
  items: ArchiveItem[];
}

const WALL_PAGE_STEP = 48;

// Technique chips shown in the filter bar (measured opticsTags), in reading order.
const TECHNIQUE_ORDER = [
  "고정 숏",
  "핸드헬드",
  "패닝",
  "틸트",
  "푸시인",
  "풀아웃",
  "단일 테이크",
  "빠른 컷",
  "로우키",
  "하이키",
  "고대비",
  "웜톤",
  "쿨톤",
  "기하학 조형",
  "극단적 여백",
  "대칭 구도",
  "역광 실루엣",
];
const MIN_TECHNIQUE_COUNT = 3;
const TOAST_MS = 2600;

function getItemHeightWeight(item: ArchiveItem): number {
  return 1 / getVisibleAspect(item);
}

/** 2 / 3 / 5 columns up to FHD, then 6-7 on 4K so tiles never exceed ~550 CSS px (SD loops stay sharp). */
function getResponsiveColumnCount(width: number): number {
  if (width >= 3200) return 7;
  if (width >= 2400) return 6;
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
  const [category, setCategory] = useState<WallCategory>("ALL");
  const [technique, setTechnique] = useState<string | null>(null);
  const [boardOpen, setBoardOpen] = useState<boolean>(false);
  const [sharedBoardIds, setSharedBoardIds] = useState<string[] | null>(null);
  const [fullCatalog, setFullCatalog] = useState<ArchiveItem[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const boardIds = useBoardIds();
  const boardIdSet = useMemo(() => new Set(boardIds), [boardIds]);

  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const deckInitializedRef = useRef<boolean>(false);
  const visibleItemsRef = useRef<ArchiveItem[]>([]);
  const liveItemsRef = useRef<ArchiveItem[]>(items);

  useEffect(() => {
    setLiveItems(items);
    liveItemsRef.current = items;
  }, [items]);

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
  const categoryPool = useMemo(
    () => (category === "ALL" ? orderedBaseItems : orderedBaseItems.filter((entry) => (entry.category ?? "CLASSIC_FILM") === category)),
    [orderedBaseItems, category]
  );

  const techniqueChips = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of categoryPool) {
      for (const tag of entry.opticsTags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return TECHNIQUE_ORDER.filter((tag) => (counts.get(tag) ?? 0) >= MIN_TECHNIQUE_COUNT || tag === technique).map((tag) => ({
      tag,
      count: counts.get(tag) ?? 0,
    }));
  }, [categoryPool, technique]);

  const displayedPool = useMemo(() => {
    const pool = technique ? categoryPool.filter((entry) => entry.opticsTags?.includes(technique)) : categoryPool;
    const q = debouncedQuery.trim();
    if (!q) return pool;
    return searchArchiveItems(pool, q);
  }, [categoryPool, technique, debouncedQuery]);

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
        ? allCatalogItems.find((entry) => entry.id === selectedItemId) ??
          fullCatalog.find((entry) => entry.id === selectedItemId) ??
          null
        : null,
    [allCatalogItems, fullCatalog, selectedItemId]
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
      if (selectedItemId || boardOpen) return;
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
  }, [rotateFreshDeck, selectedItemId, boardOpen]);

  const handleSearchSubmit = useCallback(() => {
    setDebouncedQuery(rawSearch.trim());
    setVisibleCount(WALL_PAGE_STEP);
  }, [rawSearch]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  useEffect(() => () => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
  }, []);

  const handleToggleBoard = useCallback(
    (item: ArchiveItem) => {
      const added = boardActions.toggle(item.id);
      showToast(added ? "내 보드에 담았습니다" : "내 보드에서 뺐습니다");
    },
    [showToast]
  );

  const handleCategoryChange = useCallback((next: WallCategory) => {
    setCategory(next);
    setVisibleCount(WALL_PAGE_STEP);
  }, []);

  const handleTechniqueChange = useCallback((next: string | null) => {
    setTechnique(next);
    setVisibleCount(WALL_PAGE_STEP);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // Shared board link (?board=KF-..,KF-..): resolve against the full catalog and open it read-only.
  const sharedBoardParam = searchParams.get("board");
  useEffect(() => {
    if (!sharedBoardParam) return;
    let cancelled = false;
    loadFullCatalogOnce()
      .then((catalog) => {
        if (cancelled) return;
        setFullCatalog(catalog);
        const valid = new Set([...catalog, ...liveItemsRef.current].map((entry) => entry.id));
        setSharedBoardIds(parseBoardIds(sharedBoardParam, valid));
        setBoardOpen(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [sharedBoardParam]);

  const boardViewIds = sharedBoardIds ?? boardIds;
  // Saved clips that rotated off the live wall are resolved from the full catalog.
  useEffect(() => {
    if (!boardOpen || fullCatalog.length > 0) return;
    const known = new Set(allCatalogItems.map((entry) => entry.id));
    if (boardViewIds.every((id) => known.has(id))) return;
    loadFullCatalogOnce().then(setFullCatalog).catch(() => {});
  }, [boardOpen, boardViewIds, allCatalogItems, fullCatalog.length]);

  const boardItems = useMemo(() => {
    const byId = new Map<string, ArchiveItem>();
    for (const entry of fullCatalog) byId.set(entry.id, entry);
    for (const entry of allCatalogItems) byId.set(entry.id, entry);
    return boardViewIds.map((id) => byId.get(id)).filter((entry): entry is ArchiveItem => Boolean(entry));
  }, [boardViewIds, allCatalogItems, fullCatalog]);

  const closeBoard = useCallback(() => {
    setBoardOpen(false);
    if (sharedBoardIds) {
      setSharedBoardIds(null);
      const url = new URL(window.location.href);
      url.searchParams.delete("board");
      window.history.replaceState(null, "", url.pathname + url.search);
    }
  }, [sharedBoardIds]);

  const handleOpenDetail = useCallback((item: ArchiveItem) => {
    setSelectedItemId(item.id);
    const current = loadImpressionDeckState();
    saveImpressionDeckState(recordImpressionsInState(current, [item.id], Date.now()));
  }, []);

  const clearFilters = useCallback(() => {
    setCategory("ALL");
    setTechnique(null);
    handleLogoClick();
  }, [handleLogoClick]);

  return (
    <div className="flex min-h-screen flex-col bg-[var(--kf-bg)] text-[var(--kf-text)]">
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
        boardCount={boardIds.length}
        onOpenBoard={() => setBoardOpen(true)}
      >
        <WallFilterBar
          category={category}
          onCategoryChange={handleCategoryChange}
          techniques={techniqueChips}
          activeTechnique={technique}
          onTechniqueChange={handleTechniqueChange}
          resultCount={displayedPool.length}
        />
      </EyecandyHeader>

      <main className="w-full flex-1 pt-[clamp(4px,0.4vw,16px)]">
        <div className="w-full px-[var(--kf-gutter)] pb-14">
          {displayedPool.length > 0 ? (
            <>
              <section
                aria-label="시네마·TVCF 무빙 아카이브 월"
                className="grid items-start gap-x-[clamp(8px,0.45vw,18px)]"
                style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
              >
                {masonryColumns.map((colItems, colIdx) => (
                  <div key={`col-${colIdx}`} className="flex min-w-0 flex-col gap-y-[clamp(8px,0.45vw,18px)]">
                    {colItems.map((item) => (
                      <SlideMountCard
                        key={item.id}
                        item={item}
                        onOpenDetail={handleOpenDetail}
                        onEvictItem={handleEvictItem}
                        onImpression={handleCardImpression}
                        deckEpoch={deckEpoch}
                        saved={boardIdSet.has(item.id)}
                        onToggleBoard={handleToggleBoard}
                      />
                    ))}
                  </div>
                ))}
              </section>

              {hasMoreItems && (
                <div ref={loadMoreSentinelRef} className="mt-8 flex items-center justify-center py-4">
                  <button
                    type="button"
                    onClick={() => setVisibleCount((prev) => Math.min(displayedPool.length, prev + WALL_PAGE_STEP))}
                    className="inline-flex h-[var(--kf-control-h)] items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.08] px-[clamp(24px,1.6vw,56px)] text-[length:var(--kf-text-ui)] font-medium text-white transition-[background-color,transform] duration-[160ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-white/[0.16] active:scale-[0.97]"
                  >
                    더 보기
                  </button>
                </div>
              )}
            </>
          ) : (
            <section className="mx-auto mt-10 flex max-w-lg flex-col items-center justify-center rounded-[28px] border border-white/[0.10] bg-[var(--kf-surface)] px-6 py-20 text-center">
              <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-[var(--kf-text)]">일치하는 클립이 없습니다</h2>
              <p className="mt-2 text-[15px] text-[var(--kf-text-secondary)]">
                작품명, 감독, 브랜드, 초성 또는 연출 기법으로 다시 검색해 보세요.
              </p>
              <button
                type="button"
                onClick={clearFilters}
                className="mt-6 inline-flex h-10 items-center rounded-full bg-[var(--kf-text)] px-6 text-[14px] font-semibold text-[#111111] transition-colors hover:bg-white"
              >
                전체 월로 돌아가기
              </button>
            </section>
          )}
        </div>
      </main>

      <footer className="border-t border-white/[0.08] bg-[var(--kf-bg)] py-5">
        <div className="flex w-full flex-col items-start justify-between gap-2 px-[var(--kf-gutter)] text-[clamp(12px,0.72vw,25px)] tracking-[-0.01em] text-[var(--kf-text-secondary)] sm:flex-row sm:items-center">
          <span className="font-medium text-[var(--kf-text)]/80">KINOFRAME · 시네마·TVCF 무빙 레퍼런스 아카이브</span>
          <span>
            5초 루프 <span className="num">{liveItems.length}</span>편 · SD 아카이브 포함, 원본 해상도 그대로
          </span>
        </div>
      </footer>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          data-testid="kf-toast"
          className="num fixed bottom-[calc(20px+env(safe-area-inset-bottom))] left-1/2 z-[140] sm:bottom-auto sm:top-[clamp(16px,1vw,40px)] -translate-x-1/2 animate-[kf-sheet-in_200ms_cubic-bezier(0.23,1,0.32,1)] whitespace-nowrap rounded-full border border-white/[0.14] bg-[#1C1C1E]/95 px-[clamp(18px,1.2vw,44px)] py-[clamp(9px,0.6vw,22px)] text-[length:var(--kf-text-ui)] font-medium tracking-[-0.01em] text-white shadow-[0_14px_40px_rgba(0,0,0,0.65)] backdrop-blur-2xl"
        >
          {toast}
        </div>
      )}

      <BoardDrawer
        open={boardOpen}
        mode={sharedBoardIds ? "shared" : "mine"}
        items={boardItems}
        missingCount={Math.max(0, boardViewIds.length - boardItems.length)}
        onClose={closeBoard}
        onOpenItem={(item) => {
          if (!allCatalogItems.some((entry) => entry.id === item.id)) {
            setFullCatalog((prev) => (prev.some((entry) => entry.id === item.id) ? prev : [...prev, item]));
          }
          setBoardOpen(false);
          handleOpenDetail(item);
        }}
        onRemove={(id) => boardActions.remove(id)}
        onClear={() => {
          boardActions.clear();
          showToast("보드를 비웠습니다");
        }}
        onImportShared={() => {
          if (!sharedBoardIds) return;
          boardActions.addMany(sharedBoardIds);
          showToast(`${sharedBoardIds.length}개 컷을 내 보드로 가져왔습니다`);
          closeBoard();
        }}
        onToast={showToast}
      />

      {selectedItem && (
        <ViewfinderModal
          item={selectedItem}
          hasPrev={selectedIndex > 0}
          hasNext={selectedIndex >= 0 && selectedIndex < displayedPool.length - 1}
          saved={boardIdSet.has(selectedItem.id)}
          onToggleBoard={handleToggleBoard}
          onToast={showToast}
          onSelectTechnique={(tag) => {
            setSelectedItemId(null);
            setRawSearch("");
            setDebouncedQuery("");
            handleTechniqueChange(tag);
          }}
          onClose={() => setSelectedItemId(null)}
          onPrev={() => {
            if (selectedIndex > 0) setSelectedItemId(displayedPool[selectedIndex - 1].id);
          }}
          onNext={() => {
            if (selectedIndex >= 0 && selectedIndex < displayedPool.length - 1) {
              const nextIdx = selectedIndex + 1;
              setSelectedItemId(displayedPool[nextIdx].id);
              if (nextIdx >= visibleCount) {
                setVisibleCount((prev) => Math.min(displayedPool.length, Math.max(prev, nextIdx + WALL_PAGE_STEP)));
              }
            }
          }}
        />
      )}
    </div>
  );
}
