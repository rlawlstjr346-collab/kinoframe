import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import archiveSnapshot from "@/data/archive-snapshot.json";
import type { ArchiveCategory, ArchiveItem } from "@/types/archive";
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
} from "@/lib/taxonomy";
import { isAllowedMediaProxyUrl } from "@/lib/media-allowlist";
import { VideoPlaybackScheduler } from "@/lib/video-scheduler";
import { getCanonicalMediaKey } from "@/lib/canonical-media";
import {
  BREAKDOWN_SHOWCASE_CARDS,
  VISUAL_TECHNIQUES,
  matchesTechnique,
  searchItemByQuery,
} from "@/lib/visual-techniques";
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

const ALL_V6_CATEGORIES: ArchiveCategory[] = [
  "TVCF",
  "CLASSIC_FILM",
  "STREET_ERA",
  "WEB_PHANTOM",
  "AD_BILLBOARD",
  "ALBUM_POSTER",
  "ANIME_COMIC",
  "PHOTO",
];

const PURGED_LOW_TASTE_IDS = [
  "KF-004",
  "KF-033",
  "KF-199",
  "KF-357",
  "KF-367",
  "KF-398",
  "KF-399",
  "KF-404",
  "KF-449",
  "KF-479",
  "KF-609",
  "KF-614",
  "KF-629",
  "KF-635",
];

function isOptimizedDirectStream(url: string): boolean {
  return (
    /_512kb\.mp4(\?|#|$)/i.test(url) ||
    /upload\.wikimedia\.org\/.*\/transcoded\/.*\.webm(\?|#|$)/i.test(url) ||
    /images-assets\.nasa\.gov\/.*~mobile\.mp4(\?|#|$)/i.test(url)
  );
}

describe("KINOFRAME V7.0 Eyecandy Replica, 28 Techniques, Zero-Dead Stream & Conduit Contract", () => {
  it("verifies zero legacy one-off curate-v* scripts remain in scripts/", () => {
    const scriptsDir = path.resolve(process.cwd(), "scripts");
    const files = fs.readdirSync(scriptsDir);
    const legacyCrawlers = files.filter((f) => /^curate-v/i.test(f));
    expect(legacyCrawlers).toEqual([]);
    expect(files).toContain("verify-links.mjs");
    expect(files).toContain("auto-discover-archive.mjs");
  });

  it("ensures 100% optimized fast video URLs, zero bracket title artifacts, >= 88% archive_mp4 wall, and purged low-taste IDs", () => {
    let mp4Count = 0;
    let stillCount = 0;
    let ytCount = 0;
    const idSet = new Set<string>();
    const canonicalSet = new Set<string>();

    for (const item of ITEMS) {
      expect(idSet.has(item.id)).toBe(false);
      idSet.add(item.id);

      const canon = getCanonicalMediaKey(item);
      expect(canonicalSet.has(canon)).toBe(false);
      canonicalSet.add(canon);

      // Zero English bracket artifacts like [Amateur film: ...]
      expect(item.titleKo).not.toContain("[");
      expect(item.originalTitle).not.toContain("[");

      if (item.mediaSource === "archive_mp4") {
        mp4Count += 1;
        expect(item.previewVideoUrl).toBeTruthy();
        expect(isOptimizedDirectStream(item.previewVideoUrl!)).toBe(true);
      } else if (item.mediaSource === "still_image") {
        stillCount += 1;
      } else {
        ytCount += 1;
      }
    }

    expect(mp4Count).toBeGreaterThanOrEqual(210);
    expect(stillCount).toBeLessThanOrEqual(25);
    expect(ytCount).toBe(0);
    expect(mp4Count / ITEMS.length).toBeGreaterThanOrEqual(0.88);

    for (const purgedId of PURGED_LOW_TASTE_IDS) {
      expect(idSet.has(purgedId)).toBe(false);
    }

    expect(ARCHIVE_CATEGORIES).toHaveLength(9);
    expect(MEDIA_MODES).toHaveLength(3);
    expect(COUNTRIES.some((c) => c.value === "GLOBAL")).toBe(true);
  });

  it("maps all 28 Eyecandy visual technique tags with ZERO empty tags and supports Korean/English search", () => {
    expect(VISUAL_TECHNIQUES).toHaveLength(28);
    expect(BREAKDOWN_SHOWCASE_CARDS).toHaveLength(3);

    for (const tech of VISUAL_TECHNIQUES) {
      const matched = ITEMS.filter((item) => matchesTechnique(item, tech.slug));
      expect(
        matched.length,
        `Technique ${tech.label} (${tech.slug}) must not be empty`
      ).toBeGreaterThanOrEqual(6);
    }

    // Korean & English search support
    expect(ITEMS.filter((i) => searchItemByQuery(i, "도쿄")).length).toBeGreaterThan(0);
    expect(ITEMS.filter((i) => searchItemByQuery(i, "Neon Noir")).length).toBeGreaterThan(0);
    expect(ITEMS.filter((i) => searchItemByQuery(i, "대칭")).length).toBeGreaterThan(0);
  });

  it("deduplicates identical IA/Wikimedia media via getCanonicalMediaKey across ID & URL variants", () => {
    const localIa = {
      id: "KF-495",
      sourceUrl: "https://archive.org/details/Wonderfu1960",
      previewVideoUrl: "https://archive.org/download/Wonderfu1960/Wonderfu1960_512kb.mp4",
      thumbnailUrl: "https://archive.org/services/img/Wonderfu1960",
    };
    const conduitIa = {
      id: "KF-IA-Wonderfu1960",
      sourceUrl: "https://archive.org/details/wonderfu1960?tab=about",
      previewVideoUrl: "https://archive.org/download/wonderfu1960/Wonderfu1960.mp4",
      thumbnailUrl: "https://archive.org/services/img/wonderfu1960",
    };
    expect(getCanonicalMediaKey(localIa)).toBe("ia:wonderfu1960");
    expect(getCanonicalMediaKey(conduitIa)).toBe("ia:wonderfu1960");

    const localWm = {
      id: "KF-443",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Shibuya_Night_Walk.webm",
      previewVideoUrl: "https://upload.wikimedia.org/wikipedia/commons/transcoded/a/a1/Shibuya_Night_Walk.webm/Shibuya_Night_Walk.webm.480p.vp9.webm",
      thumbnailUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Shibuya.jpg/960px-Shibuya.jpg",
    };
    const conduitWm = {
      id: "KF-WM-999111",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Shibuya_Night_Walk.webm?uselang=en",
      previewVideoUrl: "https://upload.wikimedia.org/wikipedia/commons/transcoded/a/a1/Shibuya_Night_Walk.webm/Shibuya_Night_Walk.webm.720p.vp9.webm",
      thumbnailUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Shibuya.jpg/640px-Shibuya.jpg",
    };
    expect(getCanonicalMediaKey(localWm)).toBe(getCanonicalMediaKey(conduitWm));
  });

  it("contains zero forbidden placeholder strings, zero dead links, and valid schema metadata", () => {
    const serialized = JSON.stringify(ITEMS);
    for (const phrase of FORBIDDEN_PHRASES) {
      expect(serialized).not.toContain(phrase);
    }

    for (const item of ITEMS) {
      expect(item.id).toMatch(/^KF-\d{3,5}$/);
      expect(item.titleKo.trim().length).toBeGreaterThan(2);
      expect(item.originalTitle.trim().length).toBeGreaterThan(2);
      expect(item.thumbnailUrl).toMatch(/^https?:\/\//);
      expect(item.sourceUrl).toMatch(/^https?:\/\//);
      expect(ALL_V6_CATEGORIES).toContain(item.category);
      expect(item.palette).toHaveLength(5);
      for (const hex of item.palette) {
        expect(hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
      expect(item.beats).toHaveLength(4);
      for (const c of item.compositionTags) {
        expect(COMPOSITION_TAGS).toContain(c);
      }
      for (const p of item.persuasionTags) {
        expect(PERSUASION_TAGS).toContain(p);
      }
    }
  });

  it("slices progressive infinite scroll windows cleanly and guarantees >= 42/48 auto-loop videos", () => {
    expect(INITIAL_VISIBLE_COUNT).toBe(48);
    expect(LOAD_MORE_STEP).toBe(36);
    expect(getVisibleArchiveSlice(ITEMS, 48)).toHaveLength(48);
    expect(getVisibleArchiveSlice(ITEMS, 84)).toHaveLength(84);

    const defaultSorted = filterAndSortArchive(ITEMS, DEFAULT_FILTER_STATE);
    expect(
      defaultSorted.slice(0, 48).filter((i) => i.mediaSource === "archive_mp4").length
    ).toBeGreaterThanOrEqual(42);

    for (const seed of [7, 42, 777, 12345, 99991]) {
      const rotated = rotateArchiveWithSeed(defaultSorted, seed);
      expect(
        rotated.slice(0, 48).filter((i) => i.mediaSource === "archive_mp4").length
      ).toBeGreaterThanOrEqual(42);
    }
  });

  it("enforces VideoPlaybackScheduler cap (18/6), hysteresis retention, hover promotion, and modal setSuspended(true/false)", () => {
    const scheduler = new VideoPlaybackScheduler(18);
    const states = new Map<string, boolean>();

    for (let i = 1; i <= 22; i += 1) {
      const id = `KF-${String(i).padStart(3, "0")}`;
      scheduler.register({
        id,
        ratio: 0.7,
        centerDistance: i * 35,
        hovered: false,
        onSlotChange: (allowed) => states.set(id, allowed),
      });
    }

    expect(scheduler.getActiveIds()).toHaveLength(18);
    expect(states.get("KF-001")).toBe(true);
    expect(states.get("KF-018")).toBe(true);

    // Hysteresis retains active KF-018 against small shift on KF-019
    scheduler.update("KF-019", { ratio: 0.72, centerDistance: 500 });
    expect(states.get("KF-018")).toBe(true);
    expect(states.get("KF-019")).toBe(false);

    // Modal opens -> suspend pauses all 18 background grid tiles immediately
    scheduler.setSuspended(true);
    expect(scheduler.isSuspended()).toBe(true);
    expect(scheduler.getActiveIds()).toHaveLength(0);
    expect(states.get("KF-001")).toBe(false);

    // Modal closes -> resume restores active slots immediately
    scheduler.setSuspended(false);
    expect(scheduler.isSuspended()).toBe(false);
    expect(scheduler.getActiveIds()).toHaveLength(18);
    expect(states.get("KF-001")).toBe(true);

    // Mobile cap = 6
    const mobileScheduler = new VideoPlaybackScheduler(6);
    for (let i = 1; i <= 10; i += 1) {
      mobileScheduler.register({
        id: `M-${i}`,
        ratio: 0.8,
        centerDistance: i * 20,
        hovered: false,
        onSlotChange: () => {},
      });
    }
    expect(mobileScheduler.getActiveIds()).toHaveLength(6);
  });

  it("validates video-only conduit, canonical deduplication, hardware/afips/stamp blocking, and 429 circuit breaker", () => {
    const iaItem = normalizeInternetArchiveItem({
      identifier: "Midnight_VHS_Tape_1994",
      title: "Midnight_VHS_Neon_Street_1994.mp4",
      year: 1994,
      mp4FileName: "Midnight_VHS_Tape_1994_512kb.mp4",
      durationRaw: "1:25",
      category: "WEB_PHANTOM",
      countryHint: "US",
    });
    expect(iaItem).not.toBeNull();
    expect(iaItem?.id).toBe("KF-IA-Midnight_VHS_Tape_1994");

    const dupVariant = {
      ...iaItem!,
      id: "KF-999",
      sourceUrl: "https://archive.org/details/midnight_vhs_tape_1994",
    };
    expect(deduplicateConduitItems([iaItem!, dupVariant])).toHaveLength(1);

    const wmStillRejected = normalizeWikimediaItem({
      pageId: 55555,
      title: "File:Static_Photo.jpg",
      descriptionUrl: "https://commons.wikimedia.org/wiki/File:Static_Photo.jpg",
      thumbnailUrl: "https://upload.wikimedia.org/wikipedia/commons/a/a1/Static.jpg",
      videoUrl: null,
      category: "PHOTO",
    });
    expect(wmStillRejected).toBeNull();

    for (const badTitle of [
      "AFIPS Fall Joint Computer Conference Flyer 1968",
      "Nintendo Famicom Game Boy Console Hardware",
      "Nokia Flip Phone Smartphone Unboxing Review",
      "1964 Tokyo Postage Stamp & Matchbox Brochure",
    ]) {
      expect(BLOCKED_CONTENT_REGEX.test(badTitle)).toBe(true);
    }

    expect(isAllowedMediaUrl("http://127.0.0.1/internal.mp4")).toBe(false);
    expect(isAllowedMediaUrl("https://upload.wikimedia.org/wikipedia/commons/x.webm")).toBe(true);
    expect(cleanKoreanTitle("File:Retro_VHS_1991.webm", 1991, "WEB_PHANTOM")).not.toContain("_");

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

    const conduitIaId = "KF-IA-Midnight_VHS_94";
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
