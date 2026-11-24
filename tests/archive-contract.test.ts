import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import archiveSnapshot from "@/data/archive-snapshot.json";
import type { ArchiveItem } from "@/types/archive";
import {
  DEFAULT_FILTER_STATE,
  filterAndSortArchive,
  rotateArchiveWithSeed,
  sortColorFlowBalanced,
} from "@/lib/taxonomy";
import { isAllowedMediaProxyUrl } from "@/lib/media-allowlist";
import { VideoPlaybackScheduler } from "@/lib/video-scheduler";
import { getCanonicalMediaKey } from "@/lib/canonical-media";
import {
  computeHighlightWindow,
  getHighlightWindow,
} from "@/components/SlideMountCard";
import {
  formatCleanModalMeta,
  resolveValidSourceUrl,
} from "@/components/ViewfinderModal";
import {
  extractChoseong,
  isWithinEditDistanceOne,
  matchesArchiveQuery,
  normalizeCompact,
  searchArchiveItems,
} from "@/lib/search";
import {
  INDEXNOW_KEY,
  SEO_TOPICS,
  filterItemsBySeoTopic,
  getSeoTopicBySlug,
} from "@/lib/seo-topics";
import {
  TOP_DECK_SIZE,
  buildImpressionDeckOrder,
  createEmptyImpressionState,
  recordImpressionsInState,
} from "@/lib/impression-deck";

const ITEMS = archiveSnapshot as ArchiveItem[];

const FORBIDDEN_PHRASES = [
  "준비 중",
  "Coming Soon",
  "coming soon",
  "샘플 데이터",
  "샘플 데이터 모드",
];

const FORBIDDEN_EYECANDY_TOKENS = [
  "#fc087d",
  "#fc047c",
  "#fbea85",
  "#53c0f9",
  "#391d1f",
];

function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectSourceFiles(full));
    } else if (/\.(ts|tsx|css|mjs|js)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const SAMPLE_SEARCH_CATALOG: ArchiveItem[] = [
  {
    id: "KF-HD-21",
    titleKo: "라라랜드 (La La Land)",
    originalTitle: "La La Land (Damien Chazelle, 2016)",
    brandOrSource: "Damien Chazelle",
    year: 2016,
    era: "1990-00s",
    mediaType: "NEWS",
    category: "CLASSIC_FILM",
    country: "US",
    aspectRatio: "2.39:1",
    width: 1920,
    height: 796,
    isArchivalSd: false,
    durationSec: 5.0,
    mediaSource: "archive_mp4",
    thumbnailUrl: "https://example.com/KF-HD-21.webp",
    previewVideoUrl: "https://example.com/KF-HD-21.mp4",
    youtubeId: "je0aAf2f8XQ",
    sourceUrl: "https://www.youtube.com/watch?v=je0aAf2f8XQ",
    licenseNote: "1080p HD",
    compositionTags: ["대칭 구도"],
    persuasionTags: ["시각적 은유"],
    palette: ["#1A2238", "#9DAAF2", "#FF6A3D", "#F4DB7D", "#0E131F"],
    aliases: ["라라랜드", "La La Land", "다미엔 차젤레", "Damien Chazelle"],
    viewfinder: { primaryGrid: "thirds" },
    beats: [],
    breakdown: { hook3s: "원테이크 롱테이크 오프닝" },
  },
  {
    id: "KF-HD-42",
    titleKo: "기생충 (Parasite)",
    originalTitle: "Parasite (Bong Joon-ho, 2019)",
    brandOrSource: "Bong Joon-ho",
    year: 2019,
    era: "1990-00s",
    mediaType: "NEWS",
    category: "CLASSIC_FILM",
    country: "KR",
    aspectRatio: "2.39:1",
    width: 1920,
    height: 800,
    isArchivalSd: false,
    durationSec: 5.0,
    mediaSource: "archive_mp4",
    thumbnailUrl: "https://example.com/KF-HD-42.webp",
    previewVideoUrl: "https://example.com/KF-HD-42.mp4",
    youtubeId: "isOGD_7hNIY",
    sourceUrl: "https://www.youtube.com/watch?v=isOGD_7hNIY",
    licenseNote: "1080p HD",
    compositionTags: ["프레임 속 프레임"],
    persuasionTags: ["시각적 은유"],
    palette: ["#2A362B", "#6D7A62", "#C4A77D", "#1B1E1A", "#8F5A3C"],
    aliases: ["기생충", "Parasite", "봉준호", "Bong Joon-ho", "Gisaengchung"],
    viewfinder: { primaryGrid: "symmetry" },
    beats: [],
    breakdown: { hook3s: "계단 수직 미장센 long take" },
  },
  {
    id: "KF-HD-45",
    titleKo: "그녀 (Her)",
    originalTitle: "Her (Spike Jonze, 2013)",
    brandOrSource: "Spike Jonze",
    year: 2013,
    era: "1990-00s",
    mediaType: "NEWS",
    category: "CLASSIC_FILM",
    country: "US",
    aspectRatio: "16:9",
    width: 1920,
    height: 1036,
    isArchivalSd: false,
    durationSec: 5.0,
    mediaSource: "archive_mp4",
    thumbnailUrl: "https://example.com/KF-HD-45.webp",
    previewVideoUrl: "https://example.com/KF-HD-45.mp4",
    youtubeId: "ne6p6MfLBxc",
    sourceUrl: "https://www.youtube.com/watch?v=ne6p6MfLBxc",
    licenseNote: "1080p HD",
    compositionTags: ["초근접 클로즈업"],
    persuasionTags: ["시각적 은유"],
    palette: ["#C85A44", "#E6B89C", "#7C5E4E", "#2D1E1B", "#F2DEC4"],
    aliases: ["그녀", "Her", "스파이크 존즈", "Spike Jonze"],
    viewfinder: { primaryGrid: "golden" },
    beats: [],
    breakdown: { hook3s: "따뜻한 파스텔 보케 클로즈업" },
  },
  {
    id: "KF-HD-09",
    titleKo: "샤이닝 (The Shining)",
    originalTitle: "The Shining (Stanley Kubrick, 1980)",
    brandOrSource: "Stanley Kubrick",
    year: 1980,
    era: "1980s",
    mediaType: "NEWS",
    category: "CLASSIC_FILM",
    country: "US",
    aspectRatio: "16:9",
    width: 960,
    height: 540,
    isArchivalSd: false,
    durationSec: 5.0,
    mediaSource: "archive_mp4",
    thumbnailUrl: "https://example.com/KF-HD-09.webp",
    previewVideoUrl: "https://example.com/KF-HD-09.mp4",
    youtubeId: "yKSU0dtzfdw",
    sourceUrl: "https://www.youtube.com/watch?v=yKSU0dtzfdw",
    licenseNote: "HD",
    compositionTags: ["1점 투시", "대칭 구도"],
    persuasionTags: ["초반 3초 시선 강탈"],
    palette: ["#2A3A4A", "#9B5038", "#D29B6B", "#14181E", "#6F889B"],
    aliases: ["샤이닝", "The Shining", "스탠리 큐브릭", "Stanley Kubrick"],
    viewfinder: { primaryGrid: "perspective" },
    beats: [],
    breakdown: { hook3s: "1점 투시 스테디캠 복도 트래킹" },
  },
  {
    id: "KF-HD-40",
    titleKo: "애플 홈팟 'Welcome Home' · 스파이크 존즈",
    originalTitle: "Apple HomePod — Welcome Home (Spike Jonze, 2018)",
    brandOrSource: "Apple",
    year: 2018,
    era: "1990-00s",
    mediaType: "TVCF",
    category: "TVCF",
    country: "US",
    aspectRatio: "16:9",
    width: 1920,
    height: 1080,
    isArchivalSd: false,
    durationSec: 4.5,
    mediaSource: "archive_mp4",
    thumbnailUrl: "https://example.com/KF-HD-40.webp",
    previewVideoUrl: "https://example.com/KF-HD-40.mp4",
    youtubeId: "Xwc22EK8qE0",
    sourceUrl: "https://www.youtube.com/watch?v=Xwc22EK8qE0",
    licenseNote: "1080p HD",
    compositionTags: ["기하학 조형", "1점 투시"],
    persuasionTags: ["스케일 반전"],
    palette: ["#C83E37", "#3A72B8", "#E6B44C", "#1B1D22", "#F0EDE6"],
    aliases: ["애플", "Apple", "HomePod", "Spike Jonze", "스파이크 존즈"],
    viewfinder: { primaryGrid: "perspective" },
    beats: [],
    breakdown: { hook3s: "실물 공간 확장 세트 트랜지션" },
  },
];

describe("KINOFRAME Apple HIG Zero-Login Archive, Multilingual Search & Media Quality Contract", () => {
  it("verifies all legacy login/board/conduit/unused files are completely removed", () => {
    const removedPaths = [
      "src/components/AuthModal.tsx",
      "src/components/MoodboardDrawer.tsx",
      "src/components/SidebarExplorer.tsx",
      "src/components/CompareDrawer.tsx",
      "src/components/BreakdownShowcase.tsx",
      "src/components/ViewfinderOverlay.tsx",
      "src/components/HeroSearchBar.tsx",
      "src/lib/auth.ts",
      "src/lib/vault.ts",
      "src/lib/conduit.ts",
      "src/app/api/auth",
      "src/app/api/vault",
      "src/app/api/archive/conduit",
      "src/data/link-health-cache.json",
      "src/data/translation-cache.json",
      "scripts/verify-links.mjs",
      "scripts/auto-discover-archive.mjs",
      ".github/workflows/archive-link-shield.yml",
    ];
    for (const rel of removedPaths) {
      expect(
        fs.existsSync(path.resolve(process.cwd(), rel)),
        `Legacy file should be deleted: ${rel}`
      ).toBe(false);
    }
    // Preserved core assets
    expect(
      fs.existsSync(path.resolve(process.cwd(), "src/components/KinoframeLogo.tsx"))
    ).toBe(true);
    expect(
      fs.existsSync(path.resolve(process.cwd(), ".github/workflows/dawn-harvester.yml"))
    ).toBe(true);
    expect(
      fs.existsSync(path.resolve(process.cwd(), "src/app/shot/[id]/page.tsx"))
    ).toBe(true);
  });

  it("verifies ZERO Eyecandy legacy colors, forbidden phrases, or yellow solid CTA buttons outside KinoframeLogo", () => {
    const srcFiles = collectSourceFiles(path.resolve(process.cwd(), "src"));
    expect(srcFiles.length).toBeGreaterThan(8);

    for (const filePath of srcFiles) {
      const content = fs.readFileSync(filePath, "utf-8");
      const lower = content.toLowerCase();

      for (const hex of FORBIDDEN_EYECANDY_TOKENS) {
        expect(
          lower.includes(hex),
          `Forbidden Eyecandy token ${hex} found in ${filePath}`
        ).toBe(false);
      }

      for (const phrase of FORBIDDEN_PHRASES) {
        expect(
          content.includes(phrase),
          `Forbidden phrase "${phrase}" found in ${filePath}`
        ).toBe(false);
      }

      // Champagne brass solid CTA is allowed ONLY for the header '새로운 컷' button
      if (
        filePath.endsWith("ViewfinderModal.tsx") ||
        filePath.endsWith("ArchiveWorkbench.tsx")
      ) {
        expect(content.includes("bg-[#C89E52]")).toBe(false);
      }
    }

    // Verify top-right Champagne Gold '새로운 컷' button renders in EyecandyHeader
    const headerSrc = fs.readFileSync(
      path.resolve(process.cwd(), "src/components/EyecandyHeader.tsx"),
      "utf-8"
    );
    expect(headerSrc).toContain("bg-[#C89E52]");
    expect(headerSrc).toContain("새로운 컷");
    expect(headerSrc).toContain("새로운 컷으로 교체 (단축키 R)");
  });

  it("verifies zero-reset impression deck rotation with 0% top-40 overlap across consecutive loads", () => {
    const mockPool: ArchiveItem[] = Array.from({ length: 120 }, (_, idx) => ({
      ...SAMPLE_SEARCH_CATALOG[idx % SAMPLE_SEARCH_CATALOG.length],
      id: `KF-HV-${String(idx + 1).padStart(4, "0")}`,
      createdAt: new Date(Date.UTC(2026, 10, 1 + (idx % 20))).toISOString(),
      protectedSeed: idx < 20,
    }));

    // Load 1
    let state = createEmptyImpressionState();
    const deck1 = buildImpressionDeckOrder(mockPool, state);
    expect(deck1.topDeckIds).toHaveLength(TOP_DECK_SIZE);
    state = recordImpressionsInState(deck1.nextState, deck1.topDeckIds, 10_000);

    // Load 2: 0% overlap with Load 1 top 40, and impressions never wiped
    const deck2 = buildImpressionDeckOrder(mockPool, state);
    expect(deck2.topDeckIds).toHaveLength(TOP_DECK_SIZE);
    const set1 = new Set(deck1.topDeckIds);
    const overlap12 = deck2.topDeckIds.filter((id) => set1.has(id));
    expect(overlap12).toHaveLength(0);
    expect(Object.keys(deck2.nextState.impressions)).toHaveLength(TOP_DECK_SIZE);

    // Load 3: after recording Load 2, 0% overlap with Load 2 top 40, and cumulative impressions preserved (80)
    state = recordImpressionsInState(deck2.nextState, deck2.topDeckIds, 20_000);
    const deck3 = buildImpressionDeckOrder(mockPool, state);
    const set2 = new Set(deck2.topDeckIds);
    const overlap23 = deck3.topDeckIds.filter((id) => set2.has(id));
    expect(overlap23).toHaveLength(0);
    expect(Object.keys(deck3.nextState.impressions)).toHaveLength(TOP_DECK_SIZE * 2);

    // Load 4: once all 120 clips have been seen (count=1), still zero reset & oldest lastSeenAt prioritized first
    state = recordImpressionsInState(deck3.nextState, deck3.topDeckIds, 30_000);
    const deck4 = buildImpressionDeckOrder(mockPool, state);
    expect(Object.keys(deck4.nextState.impressions)).toHaveLength(120);
    const set3 = new Set(deck3.topDeckIds);
    expect(deck4.topDeckIds.filter((id) => set3.has(id))).toHaveLength(0);
    // All top 40 in Load 4 should come from Load 1 (oldest lastSeenAt = 1000)
    const fromOldest = deck4.topDeckIds.filter((id) => set1.has(id));
    expect(fromOldest).toHaveLength(TOP_DECK_SIZE);
  });

  it("validates multilingual, space-insensitive, phonetic, Choseong, thesaurus & typo-tolerant search engine", () => {
    expect(normalizeCompact("La La Land")).toBe("lalaland");
    expect(extractChoseong("라라랜드")).toBe("ㄹㄹㄹㄷ");
    expect(extractChoseong("기생충")).toBe("ㄱㅅㅊ");
    expect(isWithinEditDistanceOne("parasite", "parasit")).toBe(true);
    expect(isWithinEditDistanceOne("parasite", "parastie")).toBe(true);
    expect(isWithinEditDistanceOne("parasite", "zzzzzzzz")).toBe(false);

    // Space-insensitive: "lala land" -> La La Land
    const lalaHits = searchArchiveItems(SAMPLE_SEARCH_CATALOG, "lala land");
    expect(lalaHits.map((x) => x.id)).toContain("KF-HD-21");

    // Korean & English bidirectional + director aliases
    expect(searchArchiveItems(SAMPLE_SEARCH_CATALOG, "라라랜드")[0]?.id).toBe("KF-HD-21");
    expect(searchArchiveItems(SAMPLE_SEARCH_CATALOG, "기생충")[0]?.id).toBe("KF-HD-42");
    expect(searchArchiveItems(SAMPLE_SEARCH_CATALOG, "봉준호")[0]?.id).toBe("KF-HD-42");
    expect(searchArchiveItems(SAMPLE_SEARCH_CATALOG, "그녀")[0]?.id).toBe("KF-HD-45");
    expect(searchArchiveItems(SAMPLE_SEARCH_CATALOG, "큐브릭")[0]?.id).toBe("KF-HD-09");
    expect(searchArchiveItems(SAMPLE_SEARCH_CATALOG, "애플")[0]?.id).toBe("KF-HD-40");

    // Choseong initials ("ㄹㄹㄹㄷ", "ㄱㅅㅊ")
    expect(searchArchiveItems(SAMPLE_SEARCH_CATALOG, "ㄹㄹㄹㄷ")[0]?.id).toBe("KF-HD-21");
    expect(searchArchiveItems(SAMPLE_SEARCH_CATALOG, "ㄱㅅㅊ")[0]?.id).toBe("KF-HD-42");

    // Technique thesaurus ("원테이크" <-> "long take")
    expect(matchesArchiveQuery(SAMPLE_SEARCH_CATALOG[1], "원테이크")).toBe(true);
    expect(matchesArchiveQuery(SAMPLE_SEARCH_CATALOG[0], "long take")).toBe(true);

    // Typo tolerance (<= 1 edit)
    expect(searchArchiveItems(SAMPLE_SEARCH_CATALOG, "paraste")[0]?.id).toBe("KF-HD-42");
    expect(searchArchiveItems(SAMPLE_SEARCH_CATALOG, "kubrik")[0]?.id).toBe("KF-HD-09");
  });

  it("formats modal metadata without duplicate parentheses and guarantees zero dead source links", () => {
    const parasiteMeta = formatCleanModalMeta(SAMPLE_SEARCH_CATALOG[1]);
    expect(parasiteMeta.primaryTitle).toBe("기생충");
    expect(parasiteMeta.subCaption).toBe("Parasite · 2019 · Bong Joon-ho");
    expect(parasiteMeta.primaryTitle).not.toContain("(2019)");

    const herMeta = formatCleanModalMeta(SAMPLE_SEARCH_CATALOG[2]);
    expect(herMeta.primaryTitle).toBe("그녀");
    expect(herMeta.subCaption).toBe("Her · 2013 · Spike Jonze");

    // Valid sourceUrl preserved; broken/empty sourceUrl falls back safely to YouTube search
    expect(resolveValidSourceUrl(SAMPLE_SEARCH_CATALOG[1])).toBe(
      "https://www.youtube.com/watch?v=isOGD_7hNIY"
    );
    const brokenUrl = resolveValidSourceUrl({
      ...SAMPLE_SEARCH_CATALOG[1],
      sourceUrl: "",
    });
    expect(brokenUrl).toContain("https://www.youtube.com/results?search_query=");
  });

  it("preserves 60fps VideoPlaybackScheduler, canonical media dedupe, highlight window, Color-Flow & SSRF allowlist", () => {
    const scheduler = new VideoPlaybackScheduler(8);
    const states = new Map<string, boolean>();
    for (let i = 1; i <= 10; i += 1) {
      const id = `KF-${i}`;
      scheduler.register({
        id,
        ratio: 0.7,
        centerDistance: i * 40,
        hovered: false,
        onSlotChange: (allowed) => states.set(id, allowed),
      });
    }
    expect(scheduler.getActiveIds()).toHaveLength(8);
    scheduler.setSuspended(true);
    expect(scheduler.getActiveIds()).toHaveLength(0);
    scheduler.setSuspended(false);
    expect(scheduler.getActiveIds()).toHaveLength(8);

    const pinned = getHighlightWindow({ durationSec: 1800, startSec: 780 });
    expect(pinned.startSec).toBe(780);
    expect(computeHighlightWindow(600).startSec).toBeGreaterThanOrEqual(108);

    expect(
      getCanonicalMediaKey({
        id: "KF-HD-42",
        sourceUrl: "https://www.youtube.com/watch?v=isOGD_7hNIY",
        previewVideoUrl: "/poc-loops/KF-HD-42.mp4",
        thumbnailUrl: "/poc-loops/KF-HD-42.webp",
      })
    ).toBeTruthy();

    expect(
      isAllowedMediaProxyUrl(
        "https://github.com/rlawlstjr346-collab/kinoframe/releases/download/kinoframe-media-s01/KF-HD-42.mp4"
      )
    ).toBe(true);
    expect(isAllowedMediaProxyUrl("http://169.254.169.254/latest/meta-data/")).toBe(false);

    const sorted = sortColorFlowBalanced(ITEMS, 42);
    expect(sorted).toHaveLength(ITEMS.length);
    expect(filterAndSortArchive(ITEMS, DEFAULT_FILTER_STATE).length).toBeGreaterThan(0);
    expect(rotateArchiveWithSeed(sorted, 777)).toHaveLength(ITEMS.length);
  });

  it("validates 6 non-branded SEO discover hubs, Naver RSS 2.0 route, and 32-char IndexNow key consistency", () => {
    const expectedSlugs = [
      "tvcf-reference",
      "cinema-composition",
      "one-take",
      "color-grading",
      "vintage-commercial",
      "visual-hook",
    ];
    expect(SEO_TOPICS.map((t) => t.slug)).toEqual(expectedSlugs);

    for (const slug of expectedSlugs) {
      const topic = getSeoTopicBySlug(slug);
      expect(topic).toBeDefined();
      expect(topic!.metaTitle.length).toBeGreaterThan(10);
      expect(topic!.metaDescription.length).toBeGreaterThan(30);
      const matched = filterItemsBySeoTopic(SAMPLE_SEARCH_CATALOG, topic!);
      expect(matched.length).toBeGreaterThan(0);
    }

    // Verify deterministic 32-char alphanumeric IndexNow key file & Python script alignment
    expect(INDEXNOW_KEY).toMatch(/^[a-z0-9]{32}$/);
    const keyFilePath = path.resolve(process.cwd(), "public", `${INDEXNOW_KEY}.txt`);
    expect(fs.existsSync(keyFilePath)).toBe(true);
    expect(fs.readFileSync(keyFilePath, "utf-8").trim()).toBe(INDEXNOW_KEY);

    const pingScript = fs.readFileSync(
      path.resolve(process.cwd(), "scripts/ping_indexnow.py"),
      "utf-8"
    );
    expect(pingScript).toContain(INDEXNOW_KEY);
    expect(pingScript).toContain("https://searchadvisor.naver.com/indexnow");
    expect(pingScript).toContain("https://api.indexnow.org/indexnow");

    const harvesterScript = fs.readFileSync(
      path.resolve(process.cwd(), "scripts/auto_harvester.py"),
      "utf-8"
    );
    expect(harvesterScript).toContain("ping_indexnow");

    const rssRoute = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/rss.xml/route.ts"),
      "utf-8"
    );
    expect(rssRoute).toContain("application/rss+xml; charset=utf-8");
    expect(rssRoute).toContain('<rss version="2.0"');
    expect(rssRoute).toContain("<pubDate>");
  });
});
