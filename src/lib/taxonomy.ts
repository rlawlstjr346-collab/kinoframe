import type {
  ArchiveCategory,
  ArchiveItem,
  AspectRatio,
  CompositionTag,
  CountryCode,
  Era,
  FilterState,
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

export const ARCHIVE_CATEGORIES: Array<{
  value: ArchiveCategory | "ALL";
  label: string;
  desc?: string;
}> = [
  { value: "ALL", label: "전체", desc: "전 장르 큐레이션" },
  { value: "TVCF", label: "TV광고", desc: "빈티지·동아시아·글로벌 TVCF" },
  { value: "CLASSIC_FILM", label: "고전영화", desc: "고전 시네마·포스터·예고편" },
  { value: "ROCK_POSTER", label: "락·음악·바이닐", desc: "락 포스터·플라이어·LP 재킷" },
  { value: "AD_POSTER", label: "광고·매거진 지면", desc: "상업 포스터·매거진 커버·화보" },
  { value: "PROPAGANDA", label: "정치 선전물", desc: "구성주의·냉전기·전시 포스터" },
  { value: "TSHIRT_GRAPHIC", label: "티셔츠·서브컬처", desc: "밴드 티·스트리트·인디 진" },
  { value: "BILLBOARD_SIGN", label: "네온·옥외간판", desc: "서울·도쿄·타이베이·홍콩 네온" },
  { value: "ANIME_COMIC", label: "고전 애니·만화", desc: "셀 애니·골든에이지 코믹·만화" },
  { value: "PACKAGING_EPHEMERA", label: "패키지·성냥갑·지류", desc: "쇼와 성냥갑·라벨·옛 티켓·우표" },
  { value: "INDUSTRIAL_DESIGN", label: "하드웨어·제품조형", desc: "브라운·필름카메라·음향·머신" },
  { value: "EXHIBITION_SPORTS", label: "올림픽·전시 그래픽", desc: "올림픽·바우하우스·미술전·SF" },
  { value: "PHOTO", label: "다큐·스트리트 사진", desc: "보도사진·도시 스냅·뉴스릴" },
];

export const COUNTRIES: Array<{ value: CountryCode | "ALL"; label: string }> = [
  { value: "ALL", label: "전체 국가" },
  { value: "KR", label: "한국" },
  { value: "JP", label: "일본" },
  { value: "TW", label: "대만" },
  { value: "US", label: "미국" },
  { value: "EU", label: "유럽" },
  { value: "GLOBAL", label: "글로벌" },
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
  category: "ALL",
  country: "ALL",
  era: "ALL",
  compositionTags: [],
  persuasionTags: [],
  query: "",
  sort: "curation_density",
  boardOnly: false,
  boardIds: [],
};

export function resolveItemCategory(item: ArchiveItem): ArchiveCategory {
  if (item.category) return item.category;
  if (item.mediaType === "TVCF") return "TVCF";
  if (item.mediaType === "PRINT") return "AD_POSTER";
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

const SUBCULTURE_BOOST_CATS = new Set<ArchiveCategory>([
  "ROCK_POSTER",
  "PROPAGANDA",
  "TSHIRT_GRAPHIC",
  "CLASSIC_FILM",
  "AD_POSTER",
  "TVCF",
  "BILLBOARD_SIGN",
  "ANIME_COMIC",
  "PACKAGING_EPHEMERA",
  "INDUSTRIAL_DESIGN",
  "EXHIBITION_SPORTS",
]);

const EAST_ASIA_COUNTRIES = new Set<CountryCode>(["KR", "JP", "TW"]);

export function computeCurationDensityScore(item: ArchiveItem): number {
  const chroma = analyzePaletteChroma(item.palette);
  const cat = resolveItemCategory(item);
  const country = resolveItemCountry(item);

  const chromaScore =
    chroma.avgSaturation * 16 +
    (chroma.isChromatic ? 8.5 : 0) +
    chroma.vividCount * 1.4 +
    chroma.luminanceSpread * 3.2;

  const eastAsiaBonus = EAST_ASIA_COUNTRIES.has(country) ? 6.5 : 0;
  const subcultureBonus = SUBCULTURE_BOOST_CATS.has(cat) ? 4.0 : 1.5;
  const manualPriority = item.priorityBoost ?? 0;

  const motionBonus =
    item.mediaSource === "archive_mp4"
      ? chroma.isChromatic
        ? 3.8
        : 1.0
      : item.mediaSource === "youtube_embed"
      ? chroma.isChromatic
        ? 4.2
        : 2.0
      : chroma.isChromatic
      ? 3.2
      : 1.0;

  return chromaScore + eastAsiaBonus + subcultureBonus + motionBonus + manualPriority;
}

const RHYTHM_CATEGORY_CYCLE: ArchiveCategory[] = [
  "ROCK_POSTER",
  "TVCF",
  "BILLBOARD_SIGN",
  "CLASSIC_FILM",
  "ANIME_COMIC",
  "PROPAGANDA",
  "PACKAGING_EPHEMERA",
  "TSHIRT_GRAPHIC",
  "INDUSTRIAL_DESIGN",
  "EXHIBITION_SPORTS",
  "AD_POSTER",
  "PHOTO",
];

function interleaveBySubcultureAndColor(
  scoredDesc: ArchiveItem[],
  scoreFn: (item: ArchiveItem) => number = computeCurationDensityScore,
  cycleOffset = 0
): ArchiveItem[] {
  if (scoredDesc.length <= 2) return scoredDesc;

  const pool = scoredDesc.map((item) => ({
    item,
    score: scoreFn(item),
    chromatic: isChromaticItem(item),
    category: resolveItemCategory(item),
    country: resolveItemCountry(item),
  }));

  const result: ArchiveItem[] = [];
  const remaining = [...pool];

  let lastMedia: MediaType | null = null;
  let sameMediaRun = 0;
  let lastCategory: ArchiveCategory | null = null;
  let monoRun = 0;
  let monoCountInTop16 = 0;
  const seenMediaTop16 = new Set<MediaType>();

  while (remaining.length > 0) {
    const pos = result.length;
    const preferredCategory =
      RHYTHM_CATEGORY_CYCLE[(pos + cycleOffset) % RHYTHM_CATEGORY_CYCLE.length];
    const inTop16 = pos < 16;

    let bestIdx = 0;
    let bestUtility = Number.NEGATIVE_INFINITY;

    const searchLimit = Math.min(remaining.length, 48);
    for (let i = 0; i < searchLimit; i += 1) {
      const cand = remaining[i];
      let utility = cand.score - i * 0.2;

      if (cand.item.mediaType === lastMedia) {
        utility -= sameMediaRun >= 2 ? 50 : 6;
      }

      if (cand.category === lastCategory) {
        utility -= 9;
      }

      if (cand.category === preferredCategory) {
        utility += 7.5;
      }

      // Guarantee all 4 legacy mediaTypes appear in top 16 for backward contract
      if (inTop16 && pos >= 8 && !seenMediaTop16.has(cand.item.mediaType)) {
        utility += 18;
      }

      if (!cand.chromatic) {
        if (monoRun >= 2) {
          utility -= 65;
        } else if (monoRun >= 1) {
          utility -= 15;
        }
        if (inTop16) {
          if (monoCountInTop16 >= 3) {
            utility -= 40;
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
    lastCategory = picked.category;

    if (inTop16) {
      seenMediaTop16.add(picked.item.mediaType);
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
 * Deterministic seeded smart rotation preserving chromatic richness & 7-category
 * subculture / East Asia interleaving across visits and shuffle clicks.
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
    const country = resolveItemCountry(item);
    const baseLift =
      (chroma.isChromatic ? 18 : 2) +
      (EAST_ASIA_COUNTRIES.has(country) ? 5 : 0) +
      (item.priorityBoost ?? 0);
    const score = baseLift + r * 26 + chroma.avgSaturation * 4;
    jitterMap.set(item.id, score);
  }

  const preSorted = [...items].sort((a, b) => {
    const diff = (jitterMap.get(b.id) ?? 0) - (jitterMap.get(a.id) ?? 0);
    if (Math.abs(diff) > 0.0001) return diff;
    return a.id.localeCompare(b.id);
  });

  const cycleOffset = normalizedSeed % RHYTHM_CATEGORY_CYCLE.length;
  return interleaveBySubcultureAndColor(
    preSorted,
    (item) => jitterMap.get(item.id) ?? 0,
    cycleOffset
  );
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
  const boardSet = new Set(state.boardIds);
  const activeCategory = state.category ?? "ALL";
  const activeCountry = state.country ?? "ALL";

  const filtered = items.filter((item) => {
    if (state.boardOnly && !boardSet.has(item.id)) {
      return false;
    }
    if (state.mediaType !== "ALL" && item.mediaType !== state.mediaType) {
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

  if (state.sort === "curation_density" || state.sort === "smart_mix") {
    return interleaveBySubcultureAndColor(sorted);
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
    lines.push(`- **대표 5색 팔레트**: \`${item.palette.join("` `")}\``);
    lines.push(`- **원본 아카이브**: ${item.sourceUrl}`);
    lines.push("");
  }

  return lines.join("\n").trim();
}
