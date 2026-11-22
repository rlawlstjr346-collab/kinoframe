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
} from "@/components/Icons";
import { SlideMountCard } from "@/components/SlideMountCard";
import { ViewfinderModal } from "@/components/ViewfinderModal";
import { CompareDrawer } from "@/components/CompareDrawer";
import { MoodboardDrawer } from "@/components/MoodboardDrawer";
import { AuthModal } from "@/components/AuthModal";

interface ArchiveWorkbenchProps {
  items: ArchiveItem[];
  initialSeed?: number;
}

const ASPECT_HEIGHT_WEIGHT: Record<AspectRatio, number> = {
  "4:5": 1.25,
  "4:3": 0.75,
  "3:2": 0.667,
  "16:9": 0.5625,
  "2.39:1": 0.418,
};

function getColumnCountForWidth(width: number): number {
  if (width >= 1536) return 6;
  if (width >= 1280) return 5;
  if (width >= 1024) return 4;
  if (width >= 768) return 3;
  if (width >= 640) return 2;
  return 1;
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

export function ArchiveWorkbench({
  items,
  initialSeed = 424242,
}: ArchiveWorkbenchProps) {
  const searchParams = useSearchParams();
  const [shuffleSeed] = useState<number>(initialSeed);
  const [columnCount, setColumnCount] = useState<number>(6);

  const [savedConduitItems, setSavedConduitItems] = useState<ArchiveItem[]>([]);
  const [conduitItems, setConduitItems] = useState<ArchiveItem[]>([]);
  const [conduitLoading, setConduitLoading] = useState<boolean>(false);
  const [conduitHasMore, setConduitHasMore] = useState<boolean>(true);

  const didInitRef = useRef<boolean>(false);
  const inFlightCursorRef = useRef<number | null>(null);
  const nextCursorRef = useRef<number>(1);
  const exhaustedRef = useRef<boolean>(false);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);

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

  // Account-isolated vault & session states
  const [vault, setVault] = useState<VaultState>(DEFAULT_VAULT_STATE);
  const [loadedAccountSub, setLoadedAccountSub] = useState<string | null>(null);
  const [session, setSession] = useState<AuthSessionState>({
    authenticated: false,
    user: null,
    cloudSyncAvailable: false,
  });

  // Sync responsive Masonry column count strictly on mount and resize
  useEffect(() => {
    const syncColumns = () => {
      const nextCols = getColumnCountForWidth(window.innerWidth);
      setColumnCount((prev) => (prev === nextCols ? prev : nextCols));
    };
    syncColumns();
    window.addEventListener("resize", syncColumns, { passive: true });
    return () => window.removeEventListener("resize", syncColumns);
  }, []);

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
    const serialized = serializeBoardIds(boardIds);
    if (serialized) {
      url.searchParams.set("board", serialized);
    } else {
      url.searchParams.delete("board");
    }
    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState(null, "", nextUrl);
  }, [boardIds]);

  // Deterministic SSR-matched initial seed wall — computed ONCE per visit, never reshuffled on scroll
  const orderedSeedItems = useMemo(() => {
    const base = filterAndSortArchive(items, {
      ...DEFAULT_FILTER_STATE,
      sort: "smart_mix",
    });
    return rotateArchiveWithSeed(base, shuffleSeed);
  }, [items, shuffleSeed]);

  // Strictly Append-Only list: conduit items only append at the tail, never disturbing existing tiles
  const displayedPool = useMemo(() => {
    if (boardOnly) {
      const boardSet = new Set(boardIds);
      return allCatalogItems.filter((item) => boardSet.has(item.id));
    }

    if (conduitItems.length === 0) {
      return orderedSeedItems;
    }

    const seenIds = new Set(orderedSeedItems.map((i) => i.id));
    const seenSources = new Set(orderedSeedItems.map((i) => i.sourceUrl));
    const seenVideos = new Set(
      orderedSeedItems
        .map((i) => i.previewVideoUrl)
        .filter((u): u is string => Boolean(u))
    );

    const appended: ArchiveItem[] = [];
    for (const entry of conduitItems) {
      if (seenIds.has(entry.id) || seenSources.has(entry.sourceUrl)) continue;
      if (entry.previewVideoUrl && seenVideos.has(entry.previewVideoUrl)) {
        continue;
      }
      seenIds.add(entry.id);
      seenSources.add(entry.sourceUrl);
      if (entry.previewVideoUrl) seenVideos.add(entry.previewVideoUrl);
      appended.push(entry);
    }

    return appended.length > 0
      ? [...orderedSeedItems, ...appended]
      : orderedSeedItems;
  }, [boardOnly, boardIds, allCatalogItems, orderedSeedItems, conduitItems]);

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
      const qs = new URLSearchParams({
        category: "ALL",
        country: "ALL",
        decade: "ALL",
        mediaMode: "MOTION",
        cursor: String(targetCursor),
        seed: String(shuffleSeed),
      });

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
  }, [boardOnly, items, shuffleSeed]);

  // Infinite scroll sentinel: strictly advances local window and taps conduit only when <= 18 items remain
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

  const handleBrandClick = useCallback(() => {
    setBoardOnly(false);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
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

  // Guest clicking [저장] opens login modal; logged-in users save immediately
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

  return (
    <div className="flex min-h-screen flex-col bg-[#09090B]">
      {/* Eyecandy Ultra-Minimal Single-Row Sticky Header */}
      <header className="sticky top-0 z-30 border-b border-white/[0.08] bg-[#09090B]/92 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-[2560px] items-center justify-between px-4 sm:px-6 2xl:h-[60px] 2xl:px-8">
          <button
            type="button"
            onClick={handleBrandClick}
            className="flex shrink-0 items-center gap-2.5 text-left"
            aria-label="KINOFRAME 최상단으로 이동"
          >
            <KinoframeLogo className="h-7 w-7 shrink-0 2xl:h-8 2xl:w-8" />
            <span className="font-mono text-[18px] font-bold tracking-[0.16em] text-[#FAF8F5] 2xl:text-[20px]">
              KINOFRAME
            </span>
          </button>

          <div className="flex shrink-0 items-center gap-2">
            {session.authenticated && session.user ? (
              <>
                {compareIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCompareOpen(true)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#E5A93B]/50 bg-[#E5A93B]/15 px-3.5 text-[14px] font-semibold text-[#FAF8F5] transition-colors hover:bg-[#E5A93B]/25"
                  >
                    <CompareIcon className="h-3.5 w-3.5 text-[#E5A93B]" />
                    <span>비교</span>
                    <span className="font-mono text-[12px] font-bold text-[#E5A93B]">
                      {compareIds.length}
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setBoardOpen(true)}
                  className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[14px] font-semibold transition-colors 2xl:h-10 2xl:text-[15px] ${
                    boardIds.length > 0
                      ? "bg-[#FAF8F5] text-[#09090B] hover:bg-white"
                      : "border border-white/[0.14] bg-[#141519] text-[#FAF8F5] hover:border-white/35"
                  }`}
                >
                  <BoardBookmarkIcon
                    className="h-3.5 w-3.5"
                    filled={boardIds.length > 0}
                  />
                  <span>내 보드</span>
                  {boardIds.length > 0 && (
                    <span className="font-mono text-[12px] font-bold">
                      {boardIds.length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setAuthOpen(true)}
                  className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-[#E5A93B]/45 bg-[#E5A93B]/15 px-3.5 text-[14px] font-semibold text-[#FAF8F5] transition-colors hover:bg-[#E5A93B]/25 2xl:h-10 2xl:text-[15px]"
                >
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#FAF8F5] text-[11px] font-bold text-[#09090B]">
                    {session.user.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span>{session.user.name}</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setAuthOpen(true)}
                className="inline-flex h-9 shrink-0 items-center rounded-full border border-white/[0.16] bg-[#141519] px-5 text-[14px] font-semibold text-[#FAF8F5] transition-colors hover:border-[#E5A93B] hover:text-[#E5A93B] 2xl:h-10 2xl:text-[15px]"
              >
                로그인
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Full-Bleed Ultra-Tight Moving Wall */}
      <main className="mx-auto w-full max-w-[2560px] flex-1 px-2 py-2 sm:px-3 lg:px-4">
        {/* Shared ?board= Restoration Banner (Accessible to Both Guests & Signed-In Users) */}
        {initialBoardIds.length > 0 && !sharedBannerDismissed && (
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#E5A93B]/45 bg-[#E5A93B]/12 px-5 py-2.5 text-[14px]">
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
                onClick={() => setBoardOnly((prev) => !prev)}
                className="rounded-full border border-[#E5A93B]/60 bg-[#09090B] px-3.5 py-1 text-[13px] font-semibold text-[#E5A93B]"
              >
                {boardOnly ? "전체 보기" : "공유 컷만 보기"}
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

        {/* Deterministic Fixed-Column Flex Masonry (Zero Right-Column Tear, Append-Only Stability) */}
        {displayedPool.length > 0 ? (
          <>
            <section
              aria-label="큐레이션 아카이브 그리드"
              className="grid grid-cols-1 items-start gap-1.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
            >
              {masonryColumns.map((colItems, colIdx) => (
                <div
                  key={`col-${colIdx}`}
                  className="flex min-w-0 flex-col gap-1.5"
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
                    />
                  ))}
                </div>
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
                          Math.min(displayedPool.length, prev + LOAD_MORE_STEP)
                        );
                      } else {
                        void fetchNextConduitPage();
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
              표시할 아카이브가 없습니다
            </h2>
            <button
              type="button"
              onClick={() => setBoardOnly(false)}
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#FAF8F5] px-6 py-2.5 text-[15px] font-bold text-[#09090B] hover:bg-white"
            >
              전체 무빙 월 보기
            </button>
          </section>
        )}
      </main>

      {/* Minimal Darkroom Footer */}
      <footer className="mt-6 border-t border-white/[0.07] bg-[#09090B] py-4">
        <div className="mx-auto flex w-full max-w-[2560px] flex-col items-start justify-between gap-2 px-4 font-mono text-[13px] text-[#B8B3A8] sm:flex-row sm:items-center sm:px-6 2xl:px-8">
          <span>KINOFRAME · MOVING VISUAL ARCHIVE</span>
          <span>Internet Archive · Wikimedia Commons · NASA Images</span>
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
