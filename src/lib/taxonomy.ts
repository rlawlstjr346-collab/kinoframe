import type {
  ArchiveCategory,
  ArchiveItem,
  AspectRatio,
  CompositionTag,
  CountryCode,
  Era,
  FilterState,
  MediaMode,
  MediaType,
  PersuasionTag,
  SortOption,
} from "@/types/archive";

export const INITIAL_VISIBLE_COUNT = 48;
export const LOAD_MORE_STEP = 36;

export function getVisibleArchiveSlice<T>(items: readonly T[], visibleCount: number): T[] {
  const safeCount = Math.max(INITIAL_VISIBLE_COUNT, Math.floor(visibleCount) || INITIAL_VISIBLE_COUNT);
  return items.slice(0, safeCount);
}

export const MEDIA_MODES: Array<{ value: MediaMode; label: string }> = [
  { value: "ALL", label: "전체" },
  { value: "MOTION", label: "영상만" },
  { value: "STILL", label: "이미지만" },
];

export const ARCHIVE_CATEGORIES: Array<{
  value: ArchiveCategory | "ALL";
  label: string;
  desc?: string;
}> = [
  { value: "ALL", label: "전체", desc: "전 장르 큐레이션" },
  { value: "TVCF", label: "TV광고", desc: "빈티지·동아시아·글로벌 TVCF" },
  { value: "CLASSIC_FILM", label: "영화", desc: "고전 시네마·예고편·명장면 클립" },
  { value: "STREET_ERA", label: "시대·거리", desc: "도쿄·서울·뉴욕·파리 걷기·트램·야경 기록" },
  { value: "WEB_PHANTOM", label: "인터넷 망령", desc: "심야 VHS·잊힌 캠코더·초기 3D·디지털 유물" },
  { value: "AD_BILLBOARD", label: "광고·빌보드", desc: "네온 옥외간판·지면광고·패키지 에페메라" },
  { value: "ALBUM_POSTER", label: "앨범·포스터", desc: "공연·선전·바우하우스·전시 그래픽 포스터" },
  { value: "ANIME_COMIC", label: "만화·애니", desc: "고전 셀 애니·골든에이지 코믹·극화 판화" },
  { value: "PHOTO", label: "사진", desc: "보도·코다크롬·우주·산업조형 아카이브 사진" },
];

export const COUNTRIES: Array<{ value: CountryCode | "ALL"; label: string }> = [
  { value: "ALL", label: "전체 국가" },
  { value: "KR", label: "한국" },
  { value: "JP", label: "일본" },
  { value: "CN", label: "중국" },
  { value: "TW", label: "대만" },
  { value: "US", label: "북미" },
  { value: "EU", label: "유럽" },
  { value: "GLOBAL", label: "글로벌 대도시" },
];

export const MEDIA_TYPES: Array<{
  value: MediaType | "ALL";
  label: string;
  desc: string;
}> = [
  { value: "ALL", label: "전체", desc: "전 매체 큐레이션" },
  { value: "TVCF", label: "TVCF", desc: "빈티지 광고 필름" },
  { value: "NEWS", label: "뉴스", desc: "뉴스릴·우주 기록" },
  { value: "PRINT", label: "지면·포스터", desc: "지면 광고·포스터" },
  { value: "PHOTO", label: "사진", desc: "보도·다큐멘터리 사진" },
];

export const ERAS: Array<{ value: Era | "ALL"; label: string }> = [
  { value: "ALL", label: "전체 연대" },
  { value: "1950-60s", label: "1950–60s" },
  { value: "1970s", label: "1970s" },
  { value: "1980s", label: "1980s" },
  { value: "1990-00s", label: "1990–00s" },
  { value: "2010s", label: "2010s" },
  { value: "2020s", label: "2020s" },
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
  { value: "year_asc", label: "연대 오래된순" },
  { value: "year_desc", label: "연대 최신순" },
  { value: "curation_density", label: "큐레이션 밀도순" },
  { value: "recent_added", label: "최신 등록순" },
  { value: "duration_asc", label: "짧은 러닝타임순" },
];

export const DEFAULT_FILTER_STATE: FilterState = {
  mediaType: "ALL",
  mediaMode: "ALL",
  category: "ALL",
  country: "ALL",
  era: "ALL",
  compositionTags: [],
  persuasionTags: [],
  query: "",
  sort: "curation_density",
};

const VALID_V6_CATEGORIES = new Set<string>([
  "TVCF",
  "CLASSIC_FILM",
  "STREET_ERA",
  "WEB_PHANTOM",
  "AD_BILLBOARD",
  "ALBUM_POSTER",
  "ANIME_COMIC",
  "PHOTO",
]);

const LEGACY_CATEGORY_FALLBACK: Record<string, ArchiveCategory> = {
  ROCK_POSTER: "ALBUM_POSTER",
  PROPAGANDA: "ALBUM_POSTER",
  EXHIBITION_SPORTS: "ALBUM_POSTER",
  TSHIRT_GRAPHIC: "ALBUM_POSTER",
  AD_POSTER: "AD_BILLBOARD",
  BILLBOARD_SIGN: "AD_BILLBOARD",
  PACKAGING_EPHEMERA: "AD_BILLBOARD",
  INDUSTRIAL_DESIGN: "PHOTO",
};

export function resolveItemCategory(item: ArchiveItem): ArchiveCategory {
  const raw = item.category as string | undefined;
  if (raw) {
    if (VALID_V6_CATEGORIES.has(raw)) {
      return raw as ArchiveCategory;
    }
    if (raw in LEGACY_CATEGORY_FALLBACK) {
      return LEGACY_CATEGORY_FALLBACK[raw];
    }
  }
  if (item.mediaType === "TVCF") return "TVCF";
  if (item.mediaType === "PRINT") return "AD_BILLBOARD";
  if (item.mediaType === "PHOTO") return "PHOTO";
  return "CLASSIC_FILM";
}

export function resolveItemCountry(item: ArchiveItem): CountryCode {
  return item.country ?? "US";
}

export function getCategoryLabel(category: ArchiveCategory): string {
  return (
    ARCHIVE_CATEGORIES.find((c) => c.value === category)?.label ?? category
  );
}

export function getCountryLabel(country: CountryCode): string {
  return COUNTRIES.find((c) => c.value === country)?.label ?? country;
}

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

const ELITE_BOOST_CATS = new Set<ArchiveCategory>([
  "STREET_ERA",
  "TVCF",
  "CLASSIC_FILM",
  "WEB_PHANTOM",
  "ANIME_COMIC",
  "AD_BILLBOARD",
  "ALBUM_POSTER",
]);

const EAST_ASIA_COUNTRIES = new Set<CountryCode>(["KR", "JP", "CN", "TW"]);

export function computeCurationDensityScore(item: ArchiveItem): number {
  const chroma = analyzePaletteChroma(item.palette);
  const cat = resolveItemCategory(item);
  const country = resolveItemCountry(item);

  const chromaScore =
    chroma.avgSaturation * 16 +
    (chroma.isChromatic ? 8.5 : 0) +
    chroma.vividCount * 1.4 +
    chroma.luminanceSpread * 3.2;

  const eastAsiaBonus = EAST_ASIA_COUNTRIES.has(country) ? 1.5 : 0;
  const globalStreetBonus = cat === "STREET_ERA" && (country === "EU" || country === "GLOBAL") ? 1.8 : 0;
  const categoryBonus = ELITE_BOOST_CATS.has(cat) ? 4.2 : 2.0;
  const colorCinemaTvcfPriority =
    (cat === "CLASSIC_FILM" || cat === "TVCF") &&
    chroma.isChromatic &&
    item.mediaSource === "archive_mp4"
      ? 14.0
      : 0;
  const manualPriority = item.priorityBoost ?? 0;

  const motionBonus =
    item.mediaSource === "archive_mp4"
      ? chroma.isChromatic
        ? 12.0
        : 7.0
      : item.mediaSource === "youtube_embed"
      ? chroma.isChromatic
        ? 5.0
        : 2.5
      : chroma.isChromatic
      ? 3.2
      : 1.0;

  return (
    chromaScore +
    eastAsiaBonus +
    globalStreetBonus +
    categoryBonus +
    colorCinemaTvcfPriority +
    motionBonus +
    manualPriority
  );
}

const RHYTHM_CATEGORY_CYCLE: ArchiveCategory[] = [
  "STREET_ERA",
  "TVCF",
  "WEB_PHANTOM",
  "AD_BILLBOARD",
  "CLASSIC_FILM",
  "ANIME_COMIC",
  "STREET_ERA",
  "ALBUM_POSTER",
  "TVCF",
  "WEB_PHANTOM",
  "CLASSIC_FILM",
  "PHOTO",
];

interface ScoredCandidate {
  item: ArchiveItem;
  score: number;
  chromatic: boolean;
  category: ArchiveCategory;
  country: CountryCode;
}

function pickBestFromPool(
  pool: ScoredCandidate[],
  pos: number,
  preferredCategory: ArchiveCategory,
  lastMedia: MediaType | null,
  sameMediaRun: number,
  lastCategory: ArchiveCategory | null,
  lastCountry: CountryCode | null,
  sameCountryRun: number,
  monoRun: number,
  monoCountInTop16: number,
  seenMediaTop16: Set<MediaType>,
  seenCategoriesTop16: Set<ArchiveCategory>
): ScoredCandidate {
  const inTop16 = pos < 16;
  let bestIdx = 0;
  let bestUtility = Number.NEGATIVE_INFINITY;

  const searchLimit = Math.min(pool.length, 48);
  for (let i = 0; i < searchLimit; i += 1) {
    const cand = pool[i];
    let utility = cand.score - i * 0.2;

    if (cand.item.mediaType === lastMedia) {
      utility -= sameMediaRun >= 2 ? 95 : 8;
    }

    if (cand.category === lastCategory) {
      utility -= 11;
    }

    if (cand.country === lastCountry) {
      utility -= sameCountryRun >= 2 ? 55 : 6;
    }

    if (cand.category === preferredCategory) {
      utility += 8.5;
    }

    if (inTop16 && !seenCategoriesTop16.has(cand.category)) {
      utility += 7.5;
    }

    // Guarantee all 4 legacy mediaTypes appear in top 16 when present
    if (inTop16 && pos >= 5 && !seenMediaTop16.has(cand.item.mediaType)) {
      utility += 28;
    }

    if (!cand.chromatic) {
      if (monoRun >= 2) {
        utility -= 90;
      } else if (monoRun >= 1) {
        utility -= 18;
      }
      if (inTop16) {
        if (monoCountInTop16 >= 3) {
          utility -= 60;
        } else if (pos < 4) {
          utility -= 24;
        }
      }
    }

    if (utility > bestUtility) {
      bestUtility = utility;
      bestIdx = i;
    }
  }

  const [picked] = pool.splice(bestIdx, 1);
  return picked;
}

/**
 * Motion-First 7:1 Interleaver (87.5%+ Auto-Loop Moving Wall):
 * Places 7 auto-looping `archive_mp4` tiles per 8-tile cycle (`pos % 8 !== 7`)
 * so top 24 ALWAYS contains >= 21 and top 48 ALWAYS contains >= 42 (87.5%+)
 * auto-looping videos across default sorting and every seeded smart_mix rotation.
 */
function interleaveMotionFirst(
  scoredDesc: ArchiveItem[],
  scoreFn: (item: ArchiveItem) => number = computeCurationDensityScore,
  cycleOffset = 0,
  preferMotionHeavy = false
): ArchiveItem[] {
  if (scoredDesc.length <= 2) return scoredDesc;

  const motionPool: ScoredCandidate[] = [];
  const otherPool: ScoredCandidate[] = [];

  for (const item of scoredDesc) {
    const entry: ScoredCandidate = {
      item,
      score: scoreFn(item),
      chromatic: isChromaticItem(item),
      category: resolveItemCategory(item),
      country: resolveItemCountry(item),
    };
    if (item.mediaSource === "archive_mp4") {
      motionPool.push(entry);
    } else {
      otherPool.push(entry);
    }
  }

  const result: ArchiveItem[] = [];
  let lastMedia: MediaType | null = null;
  let sameMediaRun = 0;
  let lastCategory: ArchiveCategory | null = null;
  let lastCountry: CountryCode | null = null;
  let sameCountryRun = 0;
  let monoRun = 0;
  let monoCountInTop16 = 0;
  const seenMediaTop16 = new Set<MediaType>();
  const seenCategoriesTop16 = new Set<ArchiveCategory>();

  while (motionPool.length > 0 || otherPool.length > 0) {
    const pos = result.length;
    const preferredCategory =
      RHYTHM_CATEGORY_CYCLE[(pos + cycleOffset) % RHYTHM_CATEGORY_CYCLE.length];

    let useMotion = false;
    if (motionPool.length === 0) {
      useMotion = false;
    } else if (otherPool.length === 0) {
      useMotion = true;
    } else if (preferMotionHeavy) {
      useMotion = true;
    } else {
      // Strict 7:1 rhythm (87.5%+ moving wall): 7 archive_mp4 tiles per 8 slots
      useMotion = pos % 8 !== 7;
    }

    const activePool = useMotion ? motionPool : otherPool;
    const picked = pickBestFromPool(
      activePool,
      pos,
      preferredCategory,
      lastMedia,
      sameMediaRun,
      lastCategory,
      lastCountry,
      sameCountryRun,
      monoRun,
      monoCountInTop16,
      seenMediaTop16,
      seenCategoriesTop16
    );

    result.push(picked.item);

    if (picked.item.mediaType === lastMedia) {
      sameMediaRun += 1;
    } else {
      lastMedia = picked.item.mediaType;
      sameMediaRun = 1;
    }
    lastCategory = picked.category;

    if (picked.country === lastCountry) {
      sameCountryRun += 1;
    } else {
      lastCountry = picked.country;
      sameCountryRun = 1;
    }

    if (pos < 16) {
      seenMediaTop16.add(picked.item.mediaType);
      seenCategoriesTop16.add(picked.category);
    }

    if (picked.chromatic) {
      monoRun = 0;
    } else {
      monoRun += 1;
      if (pos < 16) monoCountInTop16 += 1;
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

export interface PrimaryColorHsl {
  h: number;
  s: number;
  l: number;
}

export function hexToHsl(hex: string): PrimaryColorHsl {
  const clean = hex.replace("#", "");
  const r = (Number.parseInt(clean.slice(0, 2), 16) || 0) / 255;
  const g = (Number.parseInt(clean.slice(2, 4), 16) || 0) / 255;
  const b = (Number.parseInt(clean.slice(4, 6), 16) || 0) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;

  if (d === 0) {
    return { h: 0, s: 0, l };
  }

  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) {
    h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  } else if (max === g) {
    h = ((b - r) / d + 2) * 60;
  } else {
    h = ((r - g) / d + 4) * 60;
  }
  return { h: (h + 360) % 360, s, l };
}

export function computePrimaryColorHsl(
  palette: readonly string[]
): PrimaryColorHsl {
  if (!palette || palette.length === 0) {
    return { h: 35, s: 0.4, l: 0.45 };
  }
  // Palette[0] is the extracted hero chromatic swatch from real frame pixels;
  // fall back to most expressive chromatic swatch if palette[0] is near-neutral.
  const first = hexToHsl(palette[0]);
  if (first.s >= 0.16 && first.l >= 0.12 && first.l <= 0.88) {
    return first;
  }
  let best = first;
  let bestScore = -1;
  for (const hex of palette) {
    const hsl = hexToHsl(hex);
    const score = hsl.s * (1 - Math.abs(hsl.l - 0.5) * 1.4);
    if (score > bestScore) {
      bestScore = score;
      best = hsl;
    }
  }
  return best;
}

const TEN_SLOT_FILM_TVCF_PATTERN: ReadonlyArray<"CLASSIC_FILM" | "TVCF"> = [
  "CLASSIC_FILM",
  "CLASSIC_FILM",
  "TVCF",
  "CLASSIC_FILM",
  "TVCF",
  "CLASSIC_FILM",
  "CLASSIC_FILM",
  "TVCF",
  "CLASSIC_FILM",
  "TVCF",
];

/**
 * Color-Flow + Golden 6:4 Cinema/TVCF Sequencer:
 * - Rotates starting hue angle (0..360°) deterministically by seed
 * - Flows smoothly across neighboring HSL hue buckets (Amber -> Crimson -> Magenta -> Blue/Cyan -> Emerald)
 *   and within each 24° bucket glides by lightness/saturation
 * - Guarantees 6 CLASSIC_FILM (60%) : 4 TVCF (40%) inside every 10-slot window
 */
export function sortColorFlowBalanced(
  items: ArchiveItem[],
  seed = 0
): ArchiveItem[] {
  if (items.length <= 2) return [...items];

  const normalizedSeed = Math.abs(Math.floor(seed));
  const startHue = (normalizedSeed * 47) % 360;

  interface FlowEntry {
    item: ArchiveItem;
    relHue: number;
    bucket: number;
    toneKey: number;
    category: ArchiveCategory;
  }

  const toFlowEntry = (item: ArchiveItem): FlowEntry => {
    const hsl = computePrimaryColorHsl(item.palette);
    const relHue = (hsl.h - startHue + 360) % 360;
    const bucket = Math.floor(relHue / 24); // 15 harmonious 24-degree buckets
    const toneKey = hsl.l * 0.65 + hsl.s * 0.35;
    return {
      item,
      relHue,
      bucket,
      toneKey,
      category: resolveItemCategory(item),
    };
  };

  const compareFlow = (a: FlowEntry, b: FlowEntry): number => {
    if (a.bucket !== b.bucket) return a.bucket - b.bucket;
    // Alternate light->dark on even buckets and dark->light on odd buckets for seamless wave continuity
    const dir = a.bucket % 2 === 0 ? 1 : -1;
    const toneDiff = (a.toneKey - b.toneKey) * dir;
    if (Math.abs(toneDiff) > 0.0005) return toneDiff;
    if (Math.abs(a.relHue - b.relHue) > 0.05) return a.relHue - b.relHue;
    return a.item.id.localeCompare(b.item.id);
  };

  const filmPool: FlowEntry[] = [];
  const tvcfPool: FlowEntry[] = [];
  const otherPool: FlowEntry[] = [];

  for (const item of items) {
    const entry = toFlowEntry(item);
    if (entry.category === "CLASSIC_FILM") {
      filmPool.push(entry);
    } else if (entry.category === "TVCF") {
      tvcfPool.push(entry);
    } else {
      otherPool.push(entry);
    }
  }

  filmPool.sort(compareFlow);
  tvcfPool.sort(compareFlow);
  otherPool.sort(compareFlow);

  // If pure or mixed Cinema+TVCF pool, interleave along shared Color-Flow angle with 6:4 golden rhythm
  if (filmPool.length > 0 && tvcfPool.length > 0 && otherPool.length === 0) {
    const total = filmPool.length + tvcfPool.length;
    const out: ArchiveItem[] = [];

    const popClosestHue = (pool: FlowEntry[], targetHue: number): FlowEntry => {
      // Search window of first 14 entries along monotonic pool to pick tightest hue neighbor
      const limit = Math.min(pool.length, 14);
      let bestIdx = 0;
      let bestDist = Number.POSITIVE_INFINITY;
      for (let i = 0; i < limit; i += 1) {
        const diff = Math.abs(pool[i].relHue - targetHue);
        const circ = Math.min(diff, 360 - diff);
        const penalty = circ + i * 1.2;
        if (penalty < bestDist) {
          bestDist = penalty;
          bestIdx = i;
        }
      }
      const [picked] = pool.splice(bestIdx, 1);
      return picked;
    };

    for (let pos = 0; pos < total; pos += 1) {
      const targetHue = (pos / Math.max(1, total)) * 360;
      const desired = TEN_SLOT_FILM_TVCF_PATTERN[pos % 10];
      if (desired === "CLASSIC_FILM") {
        const chosen =
          filmPool.length > 0
            ? popClosestHue(filmPool, targetHue)
            : popClosestHue(tvcfPool, targetHue);
        out.push(chosen.item);
      } else {
        const chosen =
          tvcfPool.length > 0
            ? popClosestHue(tvcfPool, targetHue)
            : popClosestHue(filmPool, targetHue);
        out.push(chosen.item);
      }
    }
    return out;
  }

  // Fallback for single-category or filtered pools: pure Color-Flow sort
  const combined = [...filmPool, ...tvcfPool, ...otherPool].sort(compareFlow);
  return combined.map((e) => e.item);
}

/**
 * Deterministic seeded Color-Flow rotation:
 * Rotates starting hue angle smoothly by seed while preserving 6:4 Cinema/TVCF rhythm
 * in every 10-slot window and 100% color harmony across neighboring tiles.
 */
export function rotateArchiveWithSeed(
  items: ArchiveItem[],
  seed: number
): ArchiveItem[] {
  if (items.length <= 2) return [...items];
  return sortColorFlowBalanced(items, seed);
}

export function findRelatedArchiveItems(
  target: ArchiveItem,
  allItems: ArchiveItem[],
  limit = 8
): ArchiveItem[] {
  const targetCat = resolveItemCategory(target);
  const targetCountry = resolveItemCountry(target);

  const scored = allItems
    .filter((candidate) => candidate.id !== target.id)
    .map((candidate) => {
      let score = 0;
      if (resolveItemCategory(candidate) === targetCat) score += 6;
      if (resolveItemCountry(candidate) === targetCountry) score += 4;
      if (candidate.era === target.era) score += 2;
      if (candidate.mediaSource === target.mediaSource) score += 1;
      if (isChromaticItem(candidate)) score += 1;
      return { candidate, score };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
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
  const activeCategory = state.category ?? "ALL";
  const activeCountry = state.country ?? "ALL";
  const activeMediaMode = state.mediaMode ?? "ALL";

  const filtered = items.filter((item) => {
    if (state.mediaType !== "ALL" && item.mediaType !== state.mediaType) {
      return false;
    }
    if (
      activeMediaMode === "MOTION" &&
      item.mediaSource !== "archive_mp4" &&
      item.mediaSource !== "youtube_embed"
    ) {
      return false;
    }
    if (activeMediaMode === "STILL" && item.mediaSource !== "still_image") {
      return false;
    }
    if (activeCategory !== "ALL" && resolveItemCategory(item) !== activeCategory) {
      return false;
    }
    if (activeCountry !== "ALL" && resolveItemCountry(item) !== activeCountry) {
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
      const cat = resolveItemCategory(item);
      const country = resolveItemCountry(item);
      const haystack = [
        item.id,
        item.titleKo,
        item.originalTitle,
        item.brandOrSource,
        String(item.year),
        item.mediaType,
        cat,
        getCategoryLabel(cat),
        country,
        getCountryLabel(country),
        item.era,
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
        const diff =
          computeCurationDensityScore(b) - computeCurationDensityScore(a);
        if (Math.abs(diff) > 0.01) return diff;
        return a.id.localeCompare(b.id);
      }
    }
  });

  if (state.sort === "smart_mix") {
    return sortColorFlowBalanced(sorted, 0);
  }

  if (state.sort === "curation_density") {
    return interleaveMotionFirst(
      sorted,
      computeCurationDensityScore,
      0,
      activeMediaMode === "MOTION"
    );
  }

  return sorted;
}

const BOARD_ID_PATTERN = /^KF-(?:\d{3,5}|(?:HD|HV)-\d{2,6}|(?:IA|WM)-[A-Za-z0-9_-]{2,48})$/;

function normalizeBoardId(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const staticMatch = trimmed.match(/^kf-(\d{3,5})$/i);
  if (staticMatch) {
    return `KF-${staticMatch[1]}`;
  }
  const hdMatch = trimmed.match(/^kf-(hd|hv)-(\d{2,6})$/i);
  if (hdMatch) {
    return `KF-${hdMatch[1].toUpperCase()}-${hdMatch[2]}`;
  }
  const conduitMatch = trimmed.match(/^kf-(ia|wm)-([A-Za-z0-9_-]{2,48})$/i);
  if (conduitMatch) {
    return `KF-${conduitMatch[1].toUpperCase()}-${conduitMatch[2]}`;
  }
  return BOARD_ID_PATTERN.test(trimmed) ? trimmed : null;
}

export function serializeBoardIds(ids: string[]): string {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const raw of ids) {
    const normalized = normalizeBoardId(raw);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      unique.push(normalized);
    }
  }
  return unique.join(",");
}

export function parseBoardIds(
  param: string | null | undefined,
  validIds: Set<string>
): string[] {
  if (!param) return [];
  const raw = param
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw) {
    const normalized = normalizeBoardId(part);
    if (!normalized) continue;
    const resolved = validIds.has(normalized)
      ? normalized
      : validIds.has(normalized.toUpperCase())
      ? normalized.toUpperCase()
      : null;
    if (resolved && !seen.has(resolved)) {
      seen.add(resolved);
      out.push(resolved);
    }
  }
  return out;
}

export function generateMoodboardMarkdown(
  items: ArchiveItem[],
  shareUrl: string
): string {
  const lines: string[] = [
    `# KINOFRAME 레퍼런스 보드 (${items.length}컷)`,
    "",
    `- 공유 링크: ${shareUrl}`,
    `- 구성 카테고리: ${Array.from(
      new Set(items.map((i) => getCategoryLabel(resolveItemCategory(i))))
    ).join(" · ")}`,
    "",
    "---",
    "",
  ];

  for (const item of items) {
    const catLabel = getCategoryLabel(resolveItemCategory(item));
    const countryLabel = getCountryLabel(resolveItemCountry(item));
    lines.push(`## [${item.id}] ${item.titleKo} (${item.year})`);
    lines.push(`- **원제 / 출처**: ${item.originalTitle} — ${item.brandOrSource}`);
    lines.push(
      `- **카테고리 / 국가 / 화면비**: ${catLabel} · ${countryLabel} · ${item.aspectRatio} · ${formatDuration(item.durationSec)}`
    );
    if (item.directingNote) lines.push(`- **연출 노트**: ${item.directingNote}`);
    if (item.opticsTags?.length) lines.push(`- **광학·연출 태그**: ${item.opticsTags.join(" · ")}`);
    lines.push(`- **대표 5색 팔레트**: \`${item.palette.join("` `")}\``);
    lines.push(`- **원본 아카이브**: ${item.sourceUrl}`);
    lines.push("");
  }

  return lines.join("\n").trim();
}
