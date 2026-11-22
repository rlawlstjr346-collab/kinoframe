import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import archiveSnapshot from "@/data/archive-snapshot.json";
import type { ArchiveItem } from "@/types/archive";
import {
  ARCHIVE_CATEGORIES,
  COMPOSITION_TAGS,
  COUNTRIES,
  DEFAULT_FILTER_STATE,
  INITIAL_VISIBLE_COUNT,
  LOAD_MORE_STEP,
  MEDIA_MODES,
  PERSUASION_TAGS,
  filterAndSortArchive,
  generateMoodboardMarkdown,
  getVisibleArchiveSlice,
  parseBoardIds,
  rotateArchiveWithSeed,
  serializeBoardIds,
  sortColorFlowBalanced,
} from "@/lib/taxonomy";
import { isAllowedMediaProxyUrl } from "@/lib/media-allowlist";
import { VideoPlaybackScheduler } from "@/lib/video-scheduler";
import { getCanonicalMediaKey } from "@/lib/canonical-media";
import {
  BREAKDOWN_SHOWCASE_CARDS,
  OPTICAL_BRANCHES,
  VISUAL_TECHNIQUES,
  getSiblingTechniques,
  getTechniquesByBranch,
  matchesTechnique,
  searchItemByQuery,
} from "@/lib/visual-techniques";
import {
  computeHighlightWindow,
  getHighlightWindow,
} from "@/components/SlideMountCard";
import {
  BLOCKED_CONTENT_REGEX,
  ConduitCircuitBreaker,
  cleanKoreanTitle,
  deduplicateConduitItems,
  isAllowedMediaUrl,
  normalizeInternetArchiveItem,
  normalizeWikimediaItem,
} from "@/lib/conduit";
import { isConduitItemId, isValidArchiveItemId } from "@/lib/vault";
import {
  createSessionToken,
  hashPassword,
  verifyPassword,
  verifySessionToken,
} from "@/lib/auth";

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

const FORBIDDEN_POLLUTANT_PATTERNS = [
  /TFA-319B/i,
  /LUCKY\s*STRIKE/i,
  /Popeye/i,
  /Universal\s*Newsreel/i,
  /Chevrolet\s+Leader\s+News/i,
];

function isOptimizedDirectStream(url: string): boolean {
  return (
    /_512kb\.mp4(\?|#|$)/i.test(url) ||
    /upload\.wikimedia\.org\/.*\/transcoded\/.*\.webm(\?|#|$)/i.test(url) ||
    /images-assets\.nasa\.gov\/.*~mobile\.mp4(\?|#|$)/i.test(url)
  );
}

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

describe("KINOFRAME V8 Step 2 — Pure Color Cinema (60%) & TVCF (40%), Mid-Film Pixel Thumbs, Color-Flow & Full Preservation Contract", () => {
  it("verifies zero legacy one-off curate-v* scripts remain in scripts/", () => {
    const scriptsDir = path.resolve(process.cwd(), "scripts");
    const files = fs.readdirSync(scriptsDir);
    const legacyCrawlers = files.filter((f) => /^curate-v/i.test(f));
    expect(legacyCrawlers).toEqual([]);
    expect(files).toContain("verify-links.mjs");
    expect(files).toContain("auto-discover-archive.mjs");
  });

  it("verifies ZERO Eyecandy legacy colors (#fc087d, #fc047c, #fbea85, #53c0f9, #391d1f) or forbidden placeholder strings remain in src/", () => {
    const srcFiles = collectSourceFiles(path.resolve(process.cwd(), "src"));
    expect(srcFiles.length).toBeGreaterThan(10);

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
    }
  });

  it("enforces 100% pure color CLASSIC_FILM (55~65%) : TVCF (35~45%) video catalog with ZERO street/anime/web/photo/still items", () => {
    expect(ITEMS.length).toBeGreaterThanOrEqual(120);
    expect(ITEMS.length).toBeLessThanOrEqual(160);

    let filmCount = 0;
    let tvcfCount = 0;
    const idSet = new Set<string>();
    const canonicalSet = new Set<string>();

    for (const item of ITEMS) {
      expect(idSet.has(item.id)).toBe(false);
      idSet.add(item.id);

      const canon = getCanonicalMediaKey(item);
      expect(canonicalSet.has(canon)).toBe(false);
      canonicalSet.add(canon);

      // Strictly ONLY CLASSIC_FILM or TVCF (zero STREET_ERA, ANIME_COMIC, WEB_PHANTOM, PHOTO, AD_BILLBOARD)
      expect(["CLASSIC_FILM", "TVCF"]).toContain(item.category);
      if (item.category === "CLASSIC_FILM") filmCount += 1;
      if (item.category === "TVCF") tvcfCount += 1;

      // 100% direct-stream archive_mp4 videos, ZERO still_image or youtube_embed
      expect(item.mediaSource).toBe("archive_mp4");
      expect(item.previewVideoUrl).toBeTruthy();
      expect(isOptimizedDirectStream(item.previewVideoUrl!)).toBe(true);

      // 1964+ color era (zero pre-1964 monochrome archives)
      expect(item.year).toBeGreaterThanOrEqual(1964);

      // Zero English bracket title artifacts
      expect(item.titleKo).not.toContain("[");
      expect(item.originalTitle).not.toContain("[");
    }

    const filmRatio = filmCount / ITEMS.length;
    const tvcfRatio = tvcfCount / ITEMS.length;
    expect(filmRatio).toBeGreaterThanOrEqual(0.55);
    expect(filmRatio).toBeLessThanOrEqual(0.65);
    expect(tvcfRatio).toBeGreaterThanOrEqual(0.35);
    expect(tvcfRatio).toBeLessThanOrEqual(0.45);

    expect(ARCHIVE_CATEGORIES).toHaveLength(9);
    expect(MEDIA_MODES).toHaveLength(3);
    expect(COUNTRIES.some((c) => c.value === "GLOBAL")).toBe(true);
  });

  it("enforces ZERO /services/img/ 0-sec credit thumbnails, valid mid-film .thumbs/ + startSec, and ZERO TFA-319B / LUCKY STRIKE pollutants", () => {
    const serialized = JSON.stringify(ITEMS);
    for (const pat of FORBIDDEN_POLLUTANT_PATTERNS) {
      expect(pat.test(serialized)).toBe(false);
    }
    for (const phrase of FORBIDDEN_PHRASES) {
      expect(serialized).not.toContain(phrase);
    }

    const uniquePalettes = new Set<string>();

    for (const item of ITEMS) {
      expect(item.thumbnailUrl).not.toContain("/services/img/");
      expect(item.thumbnailUrl).toMatch(/\.thumbs\/.*_\d{5,6}\.jpg/i);
      expect(typeof item.startSec).toBe("number");
      expect(item.startSec!).toBeGreaterThan(0);

      expect(item.id).toMatch(/^KF-\d{3,5}$/);
      expect(item.titleKo.trim().length).toBeGreaterThan(2);
      expect(item.originalTitle.trim().length).toBeGreaterThan(2);
      expect(item.thumbnailUrl).toMatch(/^https?:\/\//);
      expect(item.sourceUrl).toMatch(/^https?:\/\//);
      expect(item.palette).toHaveLength(5);
      for (const hex of item.palette) {
        expect(hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
      uniquePalettes.add(item.palette.join(","));

      expect(item.beats).toHaveLength(4);
      for (const c of item.compositionTags) {
        expect(COMPOSITION_TAGS).toContain(c);
      }
      for (const p of item.persuasionTags) {
        expect(PERSUASION_TAGS).toContain(p);
      }
    }

    // Real pixel-extracted palettes: >= 90% unique across the entire catalog
    expect(uniquePalettes.size / ITEMS.length).toBeGreaterThanOrEqual(0.9);
  });

  it("maps all 5 Optical Branches × 5 Techniques (25 total) with ZERO empty tags (>= 3 matches each) on pure Film+TVCF catalog", () => {
    expect(OPTICAL_BRANCHES).toHaveLength(5);
    expect(VISUAL_TECHNIQUES).toHaveLength(25);
    expect(BREAKDOWN_SHOWCASE_CARDS).toHaveLength(3);

    for (const branch of OPTICAL_BRANCHES) {
      const branchTechs = getTechniquesByBranch(branch.slug);
      expect(branchTechs).toHaveLength(5);
    }

    for (const tech of VISUAL_TECHNIQUES) {
      const matched = ITEMS.filter((item) => matchesTechnique(item, tech.slug));
      expect(
        matched.length,
        `Optical technique ${tech.label} (${tech.slug}) must match at least 3 pure color clips`
      ).toBeGreaterThanOrEqual(3);

      const siblings = getSiblingTechniques(tech.slug);
      expect(siblings).toHaveLength(5);
    }

    const slugSet = new Set(VISUAL_TECHNIQUES.map((t) => t.slug));
    for (const card of BREAKDOWN_SHOWCASE_CARDS) {
      expect(slugSet.has(card.techniqueSlug)).toBe(true);
    }

    expect(ITEMS.filter((i) => searchItemByQuery(i, "Motion Blur")).length).toBeGreaterThan(0);
    expect(ITEMS.filter((i) => searchItemByQuery(i, "Chiaroscuro Noir")).length).toBeGreaterThan(0);
    expect(ITEMS.filter((i) => searchItemByQuery(i, "TVCF")).length).toBeGreaterThan(0);
  });

  it("sequences Color-Flow smoothly with exact 6:4 Film:TVCF balance in every 10-slot window and 100% auto-loop video wall", () => {
    expect(INITIAL_VISIBLE_COUNT).toBe(48);
    expect(LOAD_MORE_STEP).toBe(36);
    expect(getVisibleArchiveSlice(ITEMS, 48)).toHaveLength(48);
    expect(getVisibleArchiveSlice(ITEMS, 84)).toHaveLength(84);

    const flowSorted = sortColorFlowBalanced(ITEMS, 42);
    expect(flowSorted).toHaveLength(ITEMS.length);

    // Every 10-slot window in top 60 maintains exact 6 CLASSIC_FILM : 4 TVCF
    for (let offset = 0; offset < 60; offset += 10) {
      const slice = flowSorted.slice(offset, offset + 10);
      const fCount = slice.filter((i) => i.category === "CLASSIC_FILM").length;
      const tCount = slice.filter((i) => i.category === "TVCF").length;
      expect(fCount).toBe(6);
      expect(tCount).toBe(4);
    }

    const defaultSorted = filterAndSortArchive(ITEMS, DEFAULT_FILTER_STATE);
    expect(
      defaultSorted.slice(0, 48).filter((i) => i.mediaSource === "archive_mp4").length
    ).toBe(48);

    for (const seed of [7, 42, 777, 12345, 99991]) {
      const rotated = rotateArchiveWithSeed(defaultSorted, seed);
      expect(
        rotated.slice(0, 48).filter((i) => i.mediaSource === "archive_mp4").length
      ).toBe(48);
    }
  });

  it("prioritizes item.startSec to align thumbnail with video playback start and skips long-feature opening credits (>=600s -> >=108s)", () => {
    const pinned = getHighlightWindow({ durationSec: 1800, startSec: 780 });
    expect(pinned.startSec).toBe(780);
    expect(pinned.endSec).toBe(792);

    const feature600 = computeHighlightWindow(600);
    expect(feature600.startSec).toBe(108);
    expect(feature600.startSec).toBeGreaterThanOrEqual(108);
    expect(feature600.endSec).toBe(120);

    const featureLong = getHighlightWindow({ durationSec: 4980 });
    expect(featureLong.startSec).toBe(240);
    expect(featureLong.endSec).toBe(252);

    const medium = computeHighlightWindow(120);
    expect(medium.startSec).toBe(32);
    expect(medium.endSec).toBe(43);

    const spot = computeHighlightWindow(45);
    expect(spot.startSec).toBe(7);
    expect(spot.endSec).toBe(17);

    const shortClip = computeHighlightWindow(18);
    expect(shortClip.startSec).toBe(2.5);
    expect(shortClip.endSec).toBe(10);
  });

  it("enforces VideoPlaybackScheduler desktop 8 / mobile 4 cap, hysteresis retention, and modal setSuspended(true/false)", () => {
    const defaultScheduler = new VideoPlaybackScheduler();
    expect(defaultScheduler.getMaxConcurrentSlots()).toBe(8);

    const scheduler = new VideoPlaybackScheduler(8);
    const states = new Map<string, boolean>();

    for (let i = 1; i <= 12; i += 1) {
      const id = `KF-${String(i).padStart(3, "0")}`;
      scheduler.register({
        id,
        ratio: 0.7,
        centerDistance: i * 40,
        hovered: false,
        onSlotChange: (allowed) => states.set(id, allowed),
      });
    }

    expect(scheduler.getActiveIds()).toHaveLength(8);
    expect(states.get("KF-001")).toBe(true);
    expect(states.get("KF-008")).toBe(true);
    expect(states.get("KF-009")).toBe(false);

    scheduler.update("KF-009", { ratio: 0.72, centerDistance: 250 });
    expect(states.get("KF-008")).toBe(true);
    expect(states.get("KF-009")).toBe(false);

    scheduler.setSuspended(true);
    expect(scheduler.isSuspended()).toBe(true);
    expect(scheduler.getActiveIds()).toHaveLength(0);
    expect(states.get("KF-001")).toBe(false);

    scheduler.setSuspended(false);
    expect(scheduler.isSuspended()).toBe(false);
    expect(scheduler.getActiveIds()).toHaveLength(8);
    expect(states.get("KF-001")).toBe(true);

    const mobileScheduler = new VideoPlaybackScheduler(4);
    for (let i = 1; i <= 8; i += 1) {
      mobileScheduler.register({
        id: `M-${i}`,
        ratio: 0.8,
        centerDistance: i * 20,
        hovered: false,
        onSlotChange: () => {},
      });
    }
    expect(mobileScheduler.getActiveIds()).toHaveLength(4);
  });

  it("deduplicates identical IA/Wikimedia media via getCanonicalMediaKey across ID & URL variants", () => {
    const localIa = {
      id: "KF-1001",
      sourceUrl: "https://archive.org/details/Wonderfu1980",
      previewVideoUrl: "https://archive.org/download/Wonderfu1980/Wonderfu1980_512kb.mp4",
      thumbnailUrl: "https://archive.org/download/Wonderfu1980/Wonderfu1980.thumbs/Wonderfu1980_000045.jpg",
    };
    const conduitIa = {
      id: "KF-IA-Wonderfu1980",
      sourceUrl: "https://archive.org/details/wonderfu1980?tab=about",
      previewVideoUrl: "https://archive.org/download/wonderfu1980/Wonderfu1980.mp4",
      thumbnailUrl: "https://archive.org/download/wonderfu1980/Wonderfu1980.thumbs/Wonderfu1980_000045.jpg",
    };
    expect(getCanonicalMediaKey(localIa)).toBe("ia:wonderfu1980");
    expect(getCanonicalMediaKey(conduitIa)).toBe("ia:wonderfu1980");
  });

  it("validates color cinema/TVCF conduit, mid-film .thumbs/ enforcement, pre-1964/B&W/TFA blocking, and 429 circuit breaker", () => {
    const iaItem = normalizeInternetArchiveItem({
      identifier: "Tokyo_Color_Cinema_1984",
      title: "Tokyo_Neon_Color_Commercial_1984.mp4",
      year: 1984,
      mp4FileName: "Tokyo_Color_Cinema_1984_512kb.mp4",
      thumbFileName: "Tokyo_Color_Cinema_1984.thumbs/Tokyo_Color_Cinema_1984_000035.jpg",
      startSec: 35,
      durationRaw: "1:25",
      category: "TVCF",
      countryHint: "JP",
    });
    expect(iaItem).not.toBeNull();
    expect(iaItem?.id).toBe("KF-IA-Tokyo_Color_Cinema_1984");
    expect(iaItem?.thumbnailUrl).toContain(".thumbs/");
    expect(iaItem?.startSec).toBe(35);

    // Reject missing .thumbs/ (0-sec /services/img/ disallowed)
    const noThumbRejected = normalizeInternetArchiveItem({
      identifier: "No_Thumb_Film_1980",
      title: "Color Film 1980",
      year: 1980,
      mp4FileName: "No_Thumb_Film_1980_512kb.mp4",
      thumbFileName: null,
      category: "CLASSIC_FILM",
    });
    expect(noThumbRejected).toBeNull();

    // Reject pre-1964 monochrome era
    const pre1964Rejected = normalizeInternetArchiveItem({
      identifier: "Old_Film_1958",
      title: "Old Classic 1958",
      year: 1958,
      mp4FileName: "Old_Film_1958_512kb.mp4",
      thumbFileName: "Old_Film_1958.thumbs/Old_Film_1958_000030.jpg",
      category: "CLASSIC_FILM",
    });
    expect(pre1964Rejected).toBeNull();

    const dupVariant = {
      ...iaItem!,
      id: "KF-9999",
      sourceUrl: "https://archive.org/details/tokyo_color_cinema_1984",
    };
    expect(deduplicateConduitItems([iaItem!, dupVariant])).toHaveLength(1);

    const wmStillRejected = normalizeWikimediaItem({
      pageId: 55555,
      title: "File:Static_Photo.jpg",
      descriptionUrl: "https://commons.wikimedia.org/wiki/File:Static_Photo.jpg",
      thumbnailUrl: "https://upload.wikimedia.org/wikipedia/commons/a/a1/Static.jpg",
      videoUrl: null,
      category: "CLASSIC_FILM",
    });
    expect(wmStillRejected).toBeNull();

    for (const badTitle of [
      "AFIPS Fall Joint Computer Conference Flyer 1968",
      "Nintendo Famicom Game Boy Console Hardware",
      "Nokia Flip Phone Smartphone Unboxing Review",
      "1964 Tokyo Postage Stamp & Matchbox Brochure",
      "TFA-319B Black and White Universal Newsreel",
      "Lucky Strike Cigarette Commercial 1948",
      "Popeye Classic Cartoon Amateur Home Movie",
    ]) {
      expect(BLOCKED_CONTENT_REGEX.test(badTitle)).toBe(true);
    }

    expect(isAllowedMediaUrl("http://127.0.0.1/internal.mp4")).toBe(false);
    expect(isAllowedMediaUrl("https://upload.wikimedia.org/wikipedia/commons/x.webm")).toBe(true);
    expect(cleanKoreanTitle("File:Retro_Color_1984.webm", 1984, "TVCF")).not.toContain("_");

    const breaker = new ConduitCircuitBreaker(5000);
    expect(breaker.trip("archive.org", 429, 1000)).toBe(true);
    expect(breaker.isOpen("archive.org", 3000)).toBe(true);
    expect(breaker.isOpen("archive.org", 6001)).toBe(false);
  });

  it("verifies scrypt password hashing, HMAC-SHA256 session tokens, SSRF allowlist, and ?board= round-trip", () => {
    const hashed = hashPassword("kinoframe-test-pass-2026");
    expect(verifyPassword("kinoframe-test-pass-2026", hashed)).toBe(true);
    expect(verifyPassword("wrong-password", hashed)).toBe(false);

    const token = createSessionToken({
      sub: "account:tester@kinoframe.local",
      provider: "account",
      name: "아카이브 테스터",
      email: "tester@kinoframe.local",
    });
    expect(verifySessionToken(token)?.sub).toBe("account:tester@kinoframe.local");
    const [p, s] = token.split(".");
    expect(verifySessionToken(`${p}.${s.slice(0, -2)}AA`)).toBeNull();

    expect(isAllowedMediaProxyUrl("https://archive.org/download/x/x_512kb.mp4")).toBe(true);
    expect(isAllowedMediaProxyUrl("http://169.254.169.254/latest/meta-data/")).toBe(false);

    const conduitIaId = "KF-IA-Tokyo_Color_84";
    const conduitWmId = "KF-WM-98765432";
    expect(isValidArchiveItemId(conduitIaId)).toBe(true);
    expect(isConduitItemId(conduitWmId)).toBe(true);

    const validIds = new Set([...ITEMS.map((i) => i.id), conduitIaId, conduitWmId]);
    const serialized = serializeBoardIds([ITEMS[0].id, conduitIaId, conduitWmId, "INVALID"]);
    expect(serialized).toBe(`${ITEMS[0].id},${conduitIaId},${conduitWmId}`);
    expect(parseBoardIds(`${serialized},bad`, validIds)).toEqual([
      ITEMS[0].id,
      conduitIaId,
      conduitWmId,
    ]);
    const md = generateMoodboardMarkdown([ITEMS[0]], `https://kinoframe.example/?board=${serialized}`);
    expect(md).toContain(ITEMS[0].titleKo);
  });
});
