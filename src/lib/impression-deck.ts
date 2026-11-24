import type { ArchiveItem } from "@/types/archive";

export const IMPRESSIONS_STORAGE_KEY = "kinoframe_impressions_v2";
export const TOP_DECK_SIZE = 40;
export const HARD_EXCLUDE_POOL_THRESHOLD = 80;

export interface ImpressionEntry {
  count: number;
  lastSeenAt: number;
}

export interface ImpressionDeckState {
  impressions: Record<string, ImpressionEntry>;
  lastDeckIds: string[];
}

export interface DeckBuildResult {
  orderedIds: string[];
  topDeckIds: string[];
  nextState: ImpressionDeckState;
}

export function createEmptyImpressionState(): ImpressionDeckState {
  return {
    impressions: {},
    lastDeckIds: [],
  };
}

/** Cryptographic uniform random float in [0, 1) using crypto.getRandomValues. */
export function cryptoRandomFloat(): number {
  if (
    typeof globalThis !== "undefined" &&
    globalThis.crypto &&
    typeof globalThis.crypto.getRandomValues === "function"
  ) {
    const buf = new Uint32Array(1);
    globalThis.crypto.getRandomValues(buf);
    return buf[0] / 4294967296;
  }
  return Math.random();
}

export function cryptoFisherYatesShuffle<T>(
  list: readonly T[],
  rng: () => number = cryptoRandomFloat
): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

export function loadImpressionDeckState(): ImpressionDeckState {
  if (typeof window === "undefined") return createEmptyImpressionState();
  try {
    const raw = window.localStorage.getItem(IMPRESSIONS_STORAGE_KEY);
    if (!raw) return createEmptyImpressionState();
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return createEmptyImpressionState();
    }
    const obj = parsed as {
      impressions?: unknown;
      lastDeckIds?: unknown;
    };
    const impressions: Record<string, ImpressionEntry> = {};
    if (obj.impressions && typeof obj.impressions === "object") {
      for (const [id, val] of Object.entries(
        obj.impressions as Record<string, unknown>
      )) {
        if (!val || typeof val !== "object") continue;
        const count = Number((val as { count?: unknown }).count);
        const lastSeenAt = Number((val as { lastSeenAt?: unknown }).lastSeenAt);
        if (Number.isFinite(count) && count > 0) {
          impressions[id] = {
            count: Math.floor(count),
            lastSeenAt: Number.isFinite(lastSeenAt) ? lastSeenAt : 0,
          };
        }
      }
    }
    const lastDeckIds = Array.isArray(obj.lastDeckIds)
      ? obj.lastDeckIds
          .filter((x): x is string => typeof x === "string" && x.length > 0)
          .slice(0, TOP_DECK_SIZE)
      : [];
    return { impressions, lastDeckIds };
  } catch {
    return createEmptyImpressionState();
  }
}

export function saveImpressionDeckState(state: ImpressionDeckState): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed: ImpressionDeckState = {
      impressions: state.impressions,
      lastDeckIds: state.lastDeckIds.slice(0, TOP_DECK_SIZE),
    };
    window.localStorage.setItem(
      IMPRESSIONS_STORAGE_KEY,
      JSON.stringify(trimmed)
    );
  } catch {
    // Ignore storage quota errors
  }
}

export function recordImpressionsInState(
  state: ImpressionDeckState,
  ids: readonly string[],
  nowMs: number = Date.now()
): ImpressionDeckState {
  if (ids.length === 0) return state;
  const nextImpressions: Record<string, ImpressionEntry> = {
    ...state.impressions,
  };
  const uniqueIds = new Set(ids);
  for (const id of uniqueIds) {
    if (!id) continue;
    const prev = nextImpressions[id];
    nextImpressions[id] = {
      count: (prev?.count ?? 0) + 1,
      lastSeenAt: nowMs,
    };
  }
  return {
    impressions: nextImpressions,
    lastDeckIds: state.lastDeckIds,
  };
}

function getItemCreatedTimestamp(
  item: Pick<ArchiveItem, "createdAt" | "harvestedAt" | "addedAt">
): number {
  const raw = item.createdAt || item.harvestedAt || item.addedAt;
  if (!raw) return 0;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rankItemsByPriorityBuckets(
  subset: readonly ArchiveItem[],
  impressions: Record<string, ImpressionEntry>,
  rng: () => number
): string[] {
  const unseen: ArchiveItem[] = [];
  const seenByCount = new Map<number, ArchiveItem[]>();

  for (const item of subset) {
    const rec = impressions[item.id];
    const count = rec?.count ?? 0;
    if (count <= 0) {
      unseen.push(item);
    } else {
      const bucket = seenByCount.get(count);
      if (bucket) {
        bucket.push(item);
      } else {
        seenByCount.set(count, [item]);
      }
    }
  }

  // Bucket 1 & 2: Unseen clips (count === 0)
  // Freshly harvested clips (createdAt within 7 days of newest clip) get weighted newest-first shuffle,
  // followed by remaining unseen clips in pure cryptographic shuffle.
  let unseenOrderedIds: string[] = [];
  if (unseen.length > 0) {
    const timestamps = unseen.map((item) => ({
      item,
      ts: getItemCreatedTimestamp(item),
    }));
    const maxTs = timestamps.reduce((m, x) => (x.ts > m ? x.ts : m), 0);
    const freshCutoff = maxTs > 0 ? maxTs - 7 * 24 * 3600 * 1000 : Number.POSITIVE_INFINITY;

    const freshUnseen: { item: ArchiveItem; ts: number }[] = [];
    const restUnseen: ArchiveItem[] = [];

    for (const entry of timestamps) {
      const isLegacySeed = Boolean(
        entry.item.protectedSeed || entry.item.seedMasterpiece
      );
      if (maxTs > 0 && entry.ts >= freshCutoff && !isLegacySeed) {
        freshUnseen.push(entry);
      } else {
        restUnseen.push(entry.item);
      }
    }

    // Recency-weighted cryptographic shuffle for latest harvests:
    // preserves fresh-first priority while randomizing order on every load/click
    const freshSpan = Math.max(
      1,
      maxTs - freshUnseen.reduce((m, x) => (x.ts < m ? x.ts : m), maxTs)
    );
    const freshWeighted = freshUnseen
      .map((entry) => {
        const recencyNorm = (entry.ts - (maxTs - freshSpan)) / freshSpan; // 0..1
        // Weight recency + strong crypto jitter so newest harvests lead in a fresh permutation
        const score = recencyNorm * 0.45 + rng();
        return { id: entry.item.id, score };
      })
      .sort((a, b) => b.score - a.score)
      .map((x) => x.id);

    const restShuffled = cryptoFisherYatesShuffle(restUnseen, rng).map(
      (item) => item.id
    );
    unseenOrderedIds = [...freshWeighted, ...restShuffled];
  }

  // Bucket 3: Seen clips ordered by count ASC, then oldest lastSeenAt first (crypto-shuffled within same count/window)
  const seenOrderedIds: string[] = [];
  const sortedCounts = Array.from(seenByCount.keys()).sort((a, b) => a - b);
  for (const cnt of sortedCounts) {
    const group = seenByCount.get(cnt) ?? [];
    // Shuffle first for cryptographic tie-breaking, then order oldest lastSeenAt first (1s window)
    const shuffled = cryptoFisherYatesShuffle(group, rng);
    shuffled.sort((a, b) => {
      const ta = Math.floor((impressions[a.id]?.lastSeenAt ?? 0) / 1000);
      const tb = Math.floor((impressions[b.id]?.lastSeenAt ?? 0) / 1000);
      return ta - tb;
    });
    for (const item of shuffled) {
      seenOrderedIds.push(item.id);
    }
  }

  return [...unseenOrderedIds, ...seenOrderedIds];
}

/**
 * Builds a zero-reset, cryptographic-RNG Impression Deck order:
 * - Never wipes `impressions` history.
 * - When `items.length >= 80`, hard-excludes all `state.lastDeckIds` (previous top 40)
 *   from the new top 40 by pushing them to the tail of the returned array (0% overlap).
 * - Orders eligible items by:
 *     1) `count === 0` latest harvests (recency-weighted crypto shuffle)
 *     2) remaining `count === 0` unseen clips (crypto shuffle)
 *     3) `count` ascending + oldest `lastSeenAt` first (crypto-shuffled within same count)
 */
export function buildImpressionDeckOrder(
  items: readonly ArchiveItem[],
  state: ImpressionDeckState,
  options?: {
    rng?: () => number;
    topDeckSize?: number;
  }
): DeckBuildResult {
  const rng = options?.rng ?? cryptoRandomFloat;
  const topDeckSize = options?.topDeckSize ?? TOP_DECK_SIZE;

  const lastDeckSet = new Set(state.lastDeckIds.slice(0, topDeckSize));
  const shouldHardExclude =
    items.length >= HARD_EXCLUDE_POOL_THRESHOLD && lastDeckSet.size > 0;

  const eligible: ArchiveItem[] = [];
  const deferred: ArchiveItem[] = [];

  for (const item of items) {
    if (shouldHardExclude && lastDeckSet.has(item.id)) {
      deferred.push(item);
    } else {
      eligible.push(item);
    }
  }

  const eligibleIds = rankItemsByPriorityBuckets(
    eligible,
    state.impressions,
    rng
  );
  const deferredIds =
    deferred.length > 0
      ? rankItemsByPriorityBuckets(deferred, state.impressions, rng)
      : [];

  const orderedIds = [...eligibleIds, ...deferredIds];
  const topDeckIds = orderedIds.slice(0, topDeckSize);

  const nextState: ImpressionDeckState = {
    impressions: { ...state.impressions },
    lastDeckIds: topDeckIds,
  };

  return {
    orderedIds,
    topDeckIds,
    nextState,
  };
}
