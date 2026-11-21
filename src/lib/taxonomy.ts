import type {
  ArchiveItem,
  AspectRatio,
  CompositionTag,
  Era,
  FilterState,
  MediaType,
  PersuasionTag,
  SortOption,
} from "@/types/archive";

export const MEDIA_TYPES: Array<{ value: MediaType | "ALL"; label: string; desc: string }> = [
  { value: "ALL", label: "전체", desc: "전 매체 큐레이션" },
  { value: "TVCF", label: "TVCF", desc: "빈티지 광고 필름" },
  { value: "NEWS", label: "뉴스", desc: "뉴스릴·우주 기록" },
  { value: "PRINT", label: "지면·포스터", desc: "지면 광고·포스터" },
  { value: "PHOTO", label: "사진", desc: "보도·다큐멘터리 사진" },
];

export const ERAS: Array<{ value: Era | "ALL"; label: string }> = [
  { value: "ALL", label: "전 연대" },
  { value: "1950-60s", label: "1950–60s" },
  { value: "1970s", label: "1970s" },
  { value: "1980s", label: "1980s" },
  { value: "1990-00s", label: "1990–00s" },
];

export const COMPOSITION_TAGS: CompositionTag[] = [
  "1점 투시",
  "극단적 여백",
  "대칭 구도",
  "역광 실루엣",
  "매치 컷",
  "프레임 속 프레임",
  "초근접 클로즈업",
  "기하학 조형",
];

export const PERSUASION_TAGS: PersuasionTag[] = [
  "무대사 직관 전달",
  "초반 3초 시선 강탈",
  "시각적 은유",
  "스케일 반전",
  "카피×구도 일체형",
  "다큐 리얼리즘",
];

export const SORT_OPTIONS: Array<{ value: SortOption; label: string }> = [
  { value: "smart_mix", label: "스마트 믹스" },
  { value: "curation_density", label: "큐레이션 밀도순" },
  { value: "recent_added", label: "최신 등록순" },
  { value: "year_asc", label: "연대 오래된순" },
  { value: "year_desc", label: "연대 최신순" },
  { value: "duration_asc", label: "짧은 러닝타임순" },
];

export const DEFAULT_FILTER_STATE: FilterState = {
  mediaType: "ALL",
  era: "ALL",
  compositionTags: [],
  persuasionTags: [],
  query: "",
  sort: "curation_density",
  boardOnly: false,
  boardIds: [],
};

export function getAspectRatioClass(ratio: AspectRatio): string {
  switch (ratio) {
    case "4:3":
      return "aspect-[4/3]";
    case "3:2":
      return "aspect-[3/2]";
    case "4:5":
      return "aspect-[4/5]";
    case "16:9":
      return "aspect-video";
    case "2.39:1":
      return "aspect-[239/100]";
  }
}

export function formatDuration(durationSec: number | null): string {
  if (durationSec === null) return "STILL";
  const mins = Math.floor(durationSec / 60);
  const secs = Math.round(durationSec % 60);
  if (mins === 0) return `${secs}s`;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function formatPreciseTimestamp(seconds: number): string {
  const safe = Math.max(0, seconds);
  const mins = Math.floor(safe / 60);
  const rem = safe - mins * 60;
  const wholeSecs = Math.floor(rem);
  const tenths = Math.floor((rem - wholeSecs) * 10);
  return `${String(mins).padStart(2, "0")}:${String(wholeSecs).padStart(2, "0")}.${tenths}`;
}

export function parseTimestampToSeconds(timeOrZone: string): number | null {
  const mmss = timeOrZone.match(/(\d{1,2}):(\d{2})/);
  if (mmss) {
    return Number(mmss[1]) * 60 + Number(mmss[2]);
  }
  const secOnly = timeOrZone.match(/(\d+)\s*초/);
  if (secOnly) {
    return Number(secOnly[1]);
  }
  return null;
}

export interface PaletteChromaMetrics {
  avgSaturation: number;
  maxSaturation: number;
  vividCount: number;
  luminanceSpread: number;
  isChromatic: boolean;
}

export function analyzePaletteChroma(palette: readonly string[]): PaletteChromaMetrics {
  if (palette.length === 0) {
    return {
      avgSaturation: 0,
      maxSaturation: 0,
      vividCount: 0,
      luminanceSpread: 0,
      isChromatic: false,
    };
  }

  let satSum = 0;
  let maxSat = 0;
  let vividCount = 0;
  let minLum = 1;
  let maxLum = 0;

  for (const hex of palette) {
    const clean = hex.replace("#", "");
    const r = Number.parseInt(clean.slice(0, 2), 16) / 255;
    const g = Number.parseInt(clean.slice(2, 4), 16) / 255;
    const b = Number.parseInt(clean.slice(4, 6), 16) / 255;
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) continue;

    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const sat = maxC === 0 ? 0 : (maxC - minC) / maxC;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    satSum += sat;
    if (sat > maxSat) maxSat = sat;
    if (sat >= 0.34 && maxC >= 0.24) vividCount += 1;
    if (lum < minLum) minLum = lum;
    if (lum > maxLum) maxLum = lum;
  }

  const avgSaturation = satSum / palette.length;
  const luminanceSpread = Math.max(0, maxLum - minLum);
  const isChromatic =
    avgSaturation >= 0.27 || (maxSat >= 0.48 && vividCount >= 2);

  return {
    avgSaturation,
    maxSaturation: maxSat,
    vividCount,
    luminanceSpread,
    isChromatic,
  };
}

export function isChromaticItem(item: ArchiveItem): boolean {
  return analyzePaletteChroma(item.palette).isChromatic;
}

export function computeCurationDensityScore(item: ArchiveItem): number {
  const chroma = analyzePaletteChroma(item.palette);
  const tagScore = item.compositionTags.length * 2.2 + item.persuasionTags.length * 2.2;
  const chromaScore =
    chroma.avgSaturation * 16 +
    (chroma.isChromatic ? 8.5 : 0) +
    chroma.vividCount * 1.4 +
    chroma.luminanceSpread * 3.2;

  const motionBonus =
    item.mediaSource === "archive_mp4"
      ? chroma.isChromatic
        ? 4.2
        : 1.4
      : item.mediaSource === "youtube_embed"
      ? chroma.isChromatic
        ? 3.8
        : 1.8
      : chroma.isChromatic
      ? 3.2
      : 1.2;

  const noteDepth =
    (item.breakdown.hook3s.length +
      item.breakdown.framing.length +
      item.breakdown.marketingApply.length) /
    90;

  return tagScore + chromaScore + motionBonus + noteDepth;
}

const RHYTHM_MEDIA_CYCLE: MediaType[] = ["PRINT", "TVCF", "PHOTO", "NEWS"];

function interleaveByColorAndMedia(
  scoredDesc: ArchiveItem[],
  scoreFn: (item: ArchiveItem) => number = computeCurationDensityScore,
  cycleOffset = 0
): ArchiveItem[] {
  if (scoredDesc.length <= 2) return scoredDesc;

  const pool = scoredDesc.map((item) => ({
    item,
    score: scoreFn(item),
    chromatic: isChromaticItem(item),
    isLoopMp4: item.mediaSource === "archive_mp4",
  }));

  const result: ArchiveItem[] = [];
  const remaining = [...pool];

  let lastMedia: MediaType | null = null;
  let sameMediaRun = 0;
  let monoRun = 0;
  let monoCountInTop16 = 0;

  while (remaining.length > 0) {
    const pos = result.length;
    const preferredMedia =
      RHYTHM_MEDIA_CYCLE[(pos + cycleOffset) % RHYTHM_MEDIA_CYCLE.length];
    const wantLoopSlot = (pos + cycleOffset) % 4 === 1;
    const inTop16 = pos < 16;

    let bestIdx = 0;
    let bestUtility = Number.NEGATIVE_INFINITY;

    const searchLimit = Math.min(remaining.length, 36);
    for (let i = 0; i < searchLimit; i += 1) {
      const cand = remaining[i];
      let utility = cand.score;

      utility -= i * 0.22;

      if (cand.item.mediaType === lastMedia) {
        if (sameMediaRun >= 2) {
          utility -= 45;
        } else {
          utility -= 6;
        }
      }

      if (cand.item.mediaType === preferredMedia) {
        utility += 5.5;
      }

      if (wantLoopSlot && cand.isLoopMp4) {
        utility += 4.5;
      }

      if (!cand.chromatic) {
        if (monoRun >= 2) {
          utility -= 60;
        } else if (monoRun >= 1) {
          utility -= 14;
        }
        if (inTop16) {
          if (monoCountInTop16 >= 3) {
            utility -= 38;
          } else if (pos < 4) {
            utility -= 22;
          }
        }
      }

      if (utility > bestUtility) {
        bestUtility = utility;
        bestIdx = i;
      }
    }

    const [picked] = remaining.splice(bestIdx, 1);
    result.push(picked.item);

    if (picked.item.mediaType === lastMedia) {
      sameMediaRun += 1;
    } else {
      lastMedia = picked.item.mediaType;
      sameMediaRun = 1;
    }

    if (picked.chromatic) {
      monoRun = 0;
    } else {
      monoRun += 1;
      if (inTop16) monoCountInTop16 += 1;
    }
  }

  return result;
}

function hashSeedString(input: string, seed: number): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    h = Math.imul(h ^ input.charCodeAt(i), 0x85ebca6b) >>> 0;
    h = ((h << 13) | (h >>> 19)) >>> 0;
  }
  h = Math.imul(h ^ (h >>> 16), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
}

/**
 * Deterministic seeded smart rotation that preserves color vitality & 4-media
 * interleaving while surfacing fresh combinations on each visit or shuffle click.
 */
export function rotateArchiveWithSeed(
  items: ArchiveItem[],
  seed: number
): ArchiveItem[] {
  if (items.length <= 2) return [...items];

  const normalizedSeed = Math.abs(Math.floor(seed)) || 1;
  const jitterMap = new Map<string, number>();

  for (const item of items) {
    const r = hashSeedString(item.id, normalizedSeed);
    const chroma = analyzePaletteChroma(item.palette);
    // Keep chromatic works buoyant at the top while rotating strongly by seed
    const baseLift = chroma.isChromatic ? 18 : 2;
    const score = baseLift + r * 26 + chroma.avgSaturation * 4;
    jitterMap.set(item.id, score);
  }

  const preSorted = [...items].sort((a, b) => {
    const diff = (jitterMap.get(b.id) ?? 0) - (jitterMap.get(a.id) ?? 0);
    if (Math.abs(diff) > 0.0001) return diff;
    return a.id.localeCompare(b.id);
  });

  const cycleOffset = normalizedSeed % RHYTHM_MEDIA_CYCLE.length;
  return interleaveByColorAndMedia(
    preSorted,
    (item) => jitterMap.get(item.id) ?? 0,
    cycleOffset
  );
}

export function findRelatedArchiveItems(
  target: ArchiveItem,
  allItems: ArchiveItem[],
  limit = 4
): ArchiveItem[] {
  const targetComp = new Set(target.compositionTags);
  const targetPers = new Set(target.persuasionTags);

  const scored = allItems
    .filter((candidate) => candidate.id !== target.id)
    .map((candidate) => {
      let overlap = 0;
      for (const c of candidate.compositionTags) {
        if (targetComp.has(c)) overlap += 3;
      }
      for (const p of candidate.persuasionTags) {
        if (targetPers.has(p)) overlap += 2.5;
      }
      if (candidate.mediaType === target.mediaType) overlap += 1;
      if (isChromaticItem(candidate)) overlap += 0.5;
      return { candidate, overlap };
    })
    .sort(
      (a, b) =>
        b.overlap - a.overlap ||
        computeCurationDensityScore(b.candidate) -
          computeCurationDensityScore(a.candidate) ||
        a.candidate.id.localeCompare(b.candidate.id)
    );

  return scored.slice(0, limit).map((entry) => entry.candidate);
}

function getArchiveNumericId(id: string): number {
  const m = id.match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

export function filterAndSortArchive(
  items: ArchiveItem[],
  state: FilterState
): ArchiveItem[] {
  const q = state.query.trim().toLowerCase();
  const boardSet = new Set(state.boardIds);

  const filtered = items.filter((item) => {
    if (state.boardOnly && !boardSet.has(item.id)) {
      return false;
    }
    if (state.mediaType !== "ALL" && item.mediaType !== state.mediaType) {
      return false;
    }
    if (state.era !== "ALL" && item.era !== state.era) {
      return false;
    }
    if (state.compositionTags.length > 0) {
      const hasAllComposition = state.compositionTags.every((tag) =>
        item.compositionTags.includes(tag)
      );
      if (!hasAllComposition) return false;
    }
    if (state.persuasionTags.length > 0) {
      const hasAllPersuasion = state.persuasionTags.every((tag) =>
        item.persuasionTags.includes(tag)
      );
      if (!hasAllPersuasion) return false;
    }
    if (q.length > 0) {
      const haystack = [
        item.id,
        item.titleKo,
        item.originalTitle,
        item.brandOrSource,
        String(item.year),
        item.mediaType,
        item.era,
        ...item.compositionTags,
        ...item.persuasionTags,
        item.breakdown.hook3s,
        item.breakdown.framing,
        item.breakdown.marketingApply,
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const sorted = [...filtered];
  sorted.sort((a, b) => {
    switch (state.sort) {
      case "year_asc":
        return a.year - b.year || a.id.localeCompare(b.id);
      case "year_desc":
        return b.year - a.year || a.id.localeCompare(b.id);
      case "duration_asc": {
        const da = a.durationSec ?? Number.POSITIVE_INFINITY;
        const db = b.durationSec ?? Number.POSITIVE_INFINITY;
        return da - db || a.year - b.year || a.id.localeCompare(b.id);
      }
      case "recent_added": {
        const ta = a.addedAt ? Date.parse(a.addedAt) : 0;
        const tb = b.addedAt ? Date.parse(b.addedAt) : 0;
        if (tb !== ta) return tb - ta;
        return getArchiveNumericId(b.id) - getArchiveNumericId(a.id);
      }
      case "smart_mix":
      case "curation_density":
      default: {
        const diff = computeCurationDensityScore(b) - computeCurationDensityScore(a);
        if (Math.abs(diff) > 0.01) return diff;
        return a.id.localeCompare(b.id);
      }
    }
  });

  if (state.sort === "curation_density" || state.sort === "smart_mix") {
    return interleaveByColorAndMedia(sorted);
  }

  return sorted;
}

export function serializeBoardIds(ids: string[]): string {
  const unique = Array.from(
    new Set(
      ids
        .map((id) => id.trim().toUpperCase())
        .filter((id) => /^KF-\d{3}$/.test(id))
    )
  );
  return unique.join(",");
}

export function parseBoardIds(
  param: string | null | undefined,
  validIds: Set<string>
): string[] {
  if (!param) return [];
  const raw = param
    .split(",")
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of raw) {
    if (validIds.has(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

export function generateMoodboardMarkdown(
  items: ArchiveItem[],
  shareUrl: string
): string {
  const lines: string[] = [
    `# KINOFRAME 레퍼런스 무드보드 브리프 (${items.length}컷)`,
    "",
    `- 공유 뷰파인더 링크: ${shareUrl}`,
    `- 구성 매체: ${Array.from(new Set(items.map((i) => i.mediaType))).join(" · ")}`,
    "",
    "---",
    "",
  ];

  for (const item of items) {
    lines.push(`## [${item.id}] ${item.titleKo} (${item.year})`);
    lines.push(`- **원제 / 출처**: ${item.originalTitle} — ${item.brandOrSource}`);
    lines.push(`- **매체 / 화면비**: ${item.mediaType} · ${item.aspectRatio} · ${formatDuration(item.durationSec)}`);
    lines.push(`- **구도 택소노미**: ${item.compositionTags.join(", ")}`);
    lines.push(`- **설득 훅 택소노미**: ${item.persuasionTags.join(", ")}`);
    lines.push(`- **초반 3초 시선 고정**: ${item.breakdown.hook3s}`);
    lines.push(`- **프레이밍·명암 설계**: ${item.breakdown.framing}`);
    lines.push(`- **캠페인·숏폼 실무 적용**: ${item.breakdown.marketingApply}`);
    lines.push(`- **대표 5색 팔레트**: \`${item.palette.join("` `")}\``);
    lines.push(`- **원본 아카이브**: ${item.sourceUrl}`);
    lines.push("");
  }

  return lines.join("\n").trim();
}
