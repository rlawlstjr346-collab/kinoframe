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
  { value: "NEWS", label: "NEWS", desc: "뉴스릴·우주 기록" },
  { value: "PRINT", label: "PRINT", desc: "지면 광고·포스터" },
  { value: "PHOTO", label: "PHOTO", desc: "보도·다큐멘터리 사진" },
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
  { value: "curation_density", label: "큐레이션 밀도순" },
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

export function computeCurationDensityScore(item: ArchiveItem): number {
  const tagScore = item.compositionTags.length * 3 + item.persuasionTags.length * 3;
  const motionBonus = item.mediaSource === "archive_mp4" ? 4 : item.mediaSource === "youtube_embed" ? 3 : 2;
  const noteDepth =
    (item.breakdown.hook3s.length +
      item.breakdown.framing.length +
      item.breakdown.marketingApply.length) /
    60;
  return tagScore + motionBonus + noteDepth;
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
      case "curation_density":
      default: {
        const diff = computeCurationDensityScore(b) - computeCurationDensityScore(a);
        if (Math.abs(diff) > 0.01) return diff;
        return a.id.localeCompare(b.id);
      }
    }
  });

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
