"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type {
  ArchiveItem,
  CompositionTag,
  Era,
  FilterState,
  MediaType,
  PersuasionTag,
  SortOption,
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
  serializeBoardIds,
} from "@/lib/taxonomy";
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
    boardIds: initialBoardIds,
  }));

  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [compareOpen, setCompareOpen] = useState<boolean>(false);
  const [boardOpen, setBoardOpen] = useState<boolean>(false);
  const [sharedBannerDismissed, setSharedBannerDismissed] =
    useState<boolean>(false);

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

  const filteredItems = useMemo(
    () => filterAndSortArchive(items, filterState),
    [items, filterState]
  );

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

  const hasActiveFilters =
    filterState.mediaType !== "ALL" ||
    filterState.era !== "ALL" ||
    filterState.compositionTags.length > 0 ||
    filterState.persuasionTags.length > 0 ||
    filterState.query.trim().length > 0 ||
    filterState.boardOnly;

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
  }, []);

  const handleClearBoard = useCallback(() => {
    setFilterState((prev) => ({
      ...prev,
      boardIds: [],
      boardOnly: false,
    }));
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
      boardIds: prev.boardIds,
    }));
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      {/* Top 35mm Darkroom Navigation Bar */}
      <header className="sticky top-0 z-30 border-b border-rim bg-darkroom-base/92 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleResetFilters}
              className="flex items-center gap-2.5 text-left"
              aria-label="KINOFRAME 홈 및 필터 초기화"
            >
              <KinoframeLogo className="h-8 w-8 shrink-0" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-base font-bold tracking-[0.18em] text-ivory">
                    KINOFRAME
                  </span>
                  <span className="rounded border border-amber-kodak/40 bg-amber-kodak/12 px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-amber-kodak">
                    35MM ARCHIVE
                  </span>
                </div>
                <p className="hidden text-[11px] text-silver sm:block">
                  빈티지 광고·뉴스·보도사진 구도 &amp; 초반 3초 설득 레퍼런스 뷰파인더
                </p>
              </div>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden rounded border border-rim bg-darkroom-mount px-2.5 py-1.5 font-mono text-[11px] text-silver lg:inline-flex">
              검증 프레임 <strong className="ml-1.5 text-ivory">{items.length}</strong>
            </span>

            <button
              type="button"
              onClick={() => setCompareOpen(true)}
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 font-mono text-xs transition-colors ${
                compareIds.length > 0
                  ? "border-amber-kodak bg-amber-kodak/15 text-amber-kodak"
                  : "border-rim bg-darkroom-mount text-ivory hover:border-rim-strong"
              }`}
            >
              <CompareIcon className="h-3.5 w-3.5" />
              <span>좌우 비교</span>
              <span className="rounded bg-darkroom-base px-1.5 py-0.5 text-[10px]">
                {compareIds.length}/2
              </span>
            </button>

            <button
              type="button"
              onClick={() => setBoardOpen(true)}
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 font-mono text-xs transition-colors ${
                filterState.boardIds.length > 0
                  ? "border-amber-kodak bg-amber-kodak font-semibold text-darkroom-base"
                  : "border-rim bg-darkroom-mount text-ivory hover:border-rim-strong"
              }`}
            >
              <BoardBookmarkIcon
                className="h-3.5 w-3.5"
                filled={filterState.boardIds.length > 0}
              />
              <span>무드보드</span>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] ${
                  filterState.boardIds.length > 0
                    ? "bg-darkroom-base/20 text-darkroom-base"
                    : "bg-darkroom-base text-silver"
                }`}
              >
                {filterState.boardIds.length}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area (Zero Empty-State: Filter Bar + Curated Grid Open Immediately) */}
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-4 sm:px-6 sm:py-5">
        {/* Shared Moodboard Restoration Banner */}
        {initialBoardIds.length > 0 && !sharedBannerDismissed && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-kodak/40 bg-amber-kodak/10 px-4 py-2.5 text-xs">
            <div className="flex items-center gap-2 text-ivory">
              <BoardBookmarkIcon className="h-4 w-4 text-amber-kodak" filled />
              <span>
                공유 링크(<code className="font-mono text-amber-kodak">?board=</code>)에서{" "}
                <strong>{initialBoardIds.length}개</strong>의 레퍼런스 무드보드가 복원되었습니다.
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
                className="rounded border border-amber-kodak/50 bg-darkroom-base px-2.5 py-1 font-mono text-[11px] text-amber-kodak hover:bg-amber-kodak hover:text-darkroom-base"
              >
                {filterState.boardOnly ? "전체 아카이브 보기" : "보드 컷만 모아보기"}
              </button>
              <button
                type="button"
                onClick={() => setBoardOpen(true)}
                className="rounded bg-amber-kodak px-2.5 py-1 font-mono text-[11px] font-semibold text-darkroom-base"
              >
                무드보드 열기
              </button>
              <button
                type="button"
                onClick={() => setSharedBannerDismissed(true)}
                aria-label="알림 닫기"
                className="p-1 text-silver hover:text-ivory"
              >
                <CloseIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Dual Taxonomy Filter & Search Control Deck */}
        <section
          aria-label="이중 택소노미 필터 및 검색"
          className="mb-5 rounded-xl border border-rim bg-darkroom-mount p-3.5 sm:p-4"
        >
          {/* Row 1: Media Tabs + Era + Search + Sort */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            {/* Media Category Tabs */}
            <div
              className="flex flex-wrap items-center gap-1.5"
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
                    className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 font-mono text-xs transition-colors ${
                      active
                        ? "border-amber-kodak bg-amber-kodak font-semibold text-darkroom-base"
                        : "border-rim bg-darkroom-base text-silver hover:border-rim-strong hover:text-ivory"
                    }`}
                  >
                    <span>{m.label}</span>
                    <span
                      className={`text-[10px] ${
                        active ? "text-darkroom-base/80" : "text-silver"
                      }`}
                    >
                      {mediaCounts[m.value]}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Era + Search + Sort */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Era Selector */}
              <select
                aria-label="연대 필터"
                value={filterState.era}
                onChange={(e) =>
                  setFilterState((prev) => ({
                    ...prev,
                    era: e.target.value as Era | "ALL",
                  }))
                }
                className="rounded-md border border-rim bg-darkroom-base px-2.5 py-1.5 font-mono text-xs text-ivory focus:border-amber-kodak"
              >
                {ERAS.map((era) => (
                  <option key={era.value} value={era.value}>
                    {era.label}
                  </option>
                ))}
              </select>

              {/* Sort Selector */}
              <select
                aria-label="정렬 기준"
                value={filterState.sort}
                onChange={(e) =>
                  setFilterState((prev) => ({
                    ...prev,
                    sort: e.target.value as SortOption,
                  }))
                }
                className="rounded-md border border-rim bg-darkroom-base px-2.5 py-1.5 font-mono text-xs text-ivory focus:border-amber-kodak"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              {/* Keyword Search Input */}
              <div className="relative min-w-[210px] flex-1 sm:w-64 sm:flex-none">
                <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-silver" />
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
                  className="w-full rounded-md border border-rim bg-darkroom-base py-1.5 pl-8 pr-7 text-xs text-ivory placeholder:text-silver/75 focus:border-amber-kodak"
                />
                {filterState.query && (
                  <button
                    type="button"
                    onClick={() =>
                      setFilterState((prev) => ({ ...prev, query: "" }))
                    }
                    aria-label="검색어 지우기"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-silver hover:text-ivory"
                  >
                    <CloseIcon className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Row 2: Dual Taxonomy Cross-Filter Chips (Composition x Persuasion) */}
          <div className="mt-3.5 grid grid-cols-1 gap-3 border-t border-rim pt-3.5 lg:grid-cols-2">
            {/* Axis A: Visual Composition Taxonomy */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-silver">
                  AXIS A · 시각 구도 (COMPOSITION)
                </span>
                {filterState.compositionTags.length > 0 && (
                  <span className="font-mono text-[10px] text-ivory">
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
                      className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                        active
                          ? "border-ivory bg-ivory text-darkroom-base font-semibold"
                          : "border-rim bg-darkroom-base text-silver hover:border-rim-strong hover:text-ivory"
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Axis B: Marketing Persuasion Hook Taxonomy */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-amber-kodak">
                  AXIS B · 마케팅 설득 훅 (PERSUASION HOOK)
                </span>
                {filterState.persuasionTags.length > 0 && (
                  <span className="font-mono text-[10px] text-amber-kodak">
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
                      className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                        active
                          ? "border-amber-kodak bg-amber-kodak text-darkroom-base font-semibold"
                          : "border-amber-kodak/25 bg-darkroom-base text-silver hover:border-amber-kodak/60 hover:text-ivory"
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Active Result Telemetry + Reset */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-rim pt-2.5 font-mono text-[11px] text-silver">
            <div>
              표시 결과:{" "}
              <strong className="text-ivory">{filteredItems.length}</strong> /{" "}
              {items.length} 프레임
              {filterState.boardOnly && (
                <span className="ml-2 text-amber-kodak">· 무드보드 필터 활성</span>
              )}
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1 rounded border border-rim bg-darkroom-base px-2.5 py-1 text-[11px] text-ivory transition-colors hover:border-amber-kodak hover:text-amber-kodak"
              >
                <ResetIcon className="h-3 w-3" />
                필터 초기화
              </button>
            )}
          </div>
        </section>

        {/* Multi-Aspect-Ratio Slide Mount Grid */}
        {filteredItems.length > 0 ? (
          <section
            aria-label="큐레이션 아카이브 그리드"
            className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
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
          <section className="flex flex-col items-center justify-center rounded-xl border border-rim bg-darkroom-mount px-6 py-16 text-center">
            <p className="font-mono text-xs uppercase tracking-widest text-amber-kodak">
              NO MATCHING FRAMES
            </p>
            <h2 className="mt-2 text-base font-semibold text-ivory">
              선택한 교차 필터 조건에 일치하는 아카이브 프레임이 없습니다
            </h2>
            <p className="mt-1.5 text-xs text-silver">
              일부 구도·설득 태그를 해제하거나 전체 필터를 초기화해 모든 검증 프레임을 확인하세요.
            </p>
            <button
              type="button"
              onClick={handleResetFilters}
              className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-amber-kodak px-4 py-2 font-mono text-xs font-semibold text-darkroom-base hover:bg-amber-glow"
            >
              <ResetIcon className="h-3.5 w-3.5" />
              모든 필터 초기화
            </button>
          </section>
        )}
      </main>

      {/* Darkroom Studio Footer */}
      <footer className="mt-12 border-t border-rim bg-darkroom-recessed py-6">
        <div className="mx-auto flex max-w-[1440px] flex-col items-start justify-between gap-2 px-4 font-mono text-[11px] text-silver sm:flex-row sm:items-center sm:px-6">
          <span>
            KINOFRAME · 35MM DARKROOM ARCHIVE · ZERO-SERVER STATIC SNAPSHOT
          </span>
          <span>
            출처: Internet Archive (Prelinger / Newsreels) · NASA Images · Wikimedia Commons · YouTube Official Embed
          </span>
        </div>
      </footer>

      {/* Floating Bottom Compare Dock (when 1~2 items selected) */}
      {compareIds.length > 0 && !compareOpen && (
        <div className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border border-amber-kodak/55 bg-darkroom-mount/95 px-4 py-2 shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-2 font-mono text-xs text-ivory">
            <CompareIcon className="h-4 w-4 text-amber-kodak" />
            <span>
              비교 슬롯 <strong className="text-amber-kodak">{compareIds.join(" × ")}</strong>
            </span>
          </div>
          <button
            type="button"
            onClick={() => setCompareOpen(true)}
            className="rounded-full bg-amber-kodak px-3 py-1 font-mono text-xs font-semibold text-darkroom-base hover:bg-amber-glow"
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

      {/* Detail Viewfinder Studio Modal */}
      {selectedItem && (
        <ViewfinderModal
          item={selectedItem}
          hasPrev={selectedIndex > 0}
          hasNext={
            selectedIndex >= 0 && selectedIndex < filteredItems.length - 1
          }
          isInBoard={filterState.boardIds.includes(selectedItem.id)}
          isInCompare={compareIds.includes(selectedItem.id)}
          compareFull={compareIds.length >= 2}
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
          onToggleBoard={handleToggleBoard}
          onToggleCompare={handleToggleCompare}
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

      {/* Serverless URL-Shared Moodboard Drawer */}
      {boardOpen && (
        <MoodboardDrawer
          items={boardItems}
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
        />
      )}
    </div>
  );
}
