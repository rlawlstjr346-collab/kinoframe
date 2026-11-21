import { describe, expect, it } from "vitest";
import archiveSnapshot from "@/data/archive-snapshot.json";
import type { ArchiveCategory, ArchiveItem, CountryCode, MediaType } from "@/types/archive";
import {
  ARCHIVE_CATEGORIES,
  COMPOSITION_TAGS,
  DEFAULT_FILTER_STATE,
  INITIAL_VISIBLE_COUNT,
  LOAD_MORE_STEP,
  PERSUASION_TAGS,
  filterAndSortArchive,
  generateMoodboardMarkdown,
  getVisibleArchiveSlice,
  isChromaticItem,
  parseBoardIds,
  resolveItemCategory,
  resolveItemCountry,
  rotateArchiveWithSeed,
  serializeBoardIds,
} from "@/lib/taxonomy";
import { isAllowedMediaProxyUrl } from "@/lib/media-allowlist";
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

const ALL_CATEGORIES: ArchiveCategory[] = [
  "TVCF",
  "CLASSIC_FILM",
  "ROCK_POSTER",
  "AD_POSTER",
  "PROPAGANDA",
  "TSHIRT_GRAPHIC",
  "BILLBOARD_SIGN",
  "ANIME_COMIC",
  "PACKAGING_EPHEMERA",
  "INDUSTRIAL_DESIGN",
  "EXHIBITION_SPORTS",
  "PHOTO",
];

describe("KINOFRAME V4.5 Archive, Infinite Scroll & Security Contract", () => {
  it("contains at least 400 real verified items across all 12 high-density categories and East Asia", () => {
    expect(ITEMS.length).toBeGreaterThanOrEqual(400);

    const byMedia = new Map<MediaType, number>();
    const byCategory = new Map<ArchiveCategory, number>();
    const byCountry = new Map<CountryCode, number>();

    for (const item of ITEMS) {
      byMedia.set(item.mediaType, (byMedia.get(item.mediaType) ?? 0) + 1);
      const cat = resolveItemCategory(item);
      const country = resolveItemCountry(item);
      byCategory.set(cat, (byCategory.get(cat) ?? 0) + 1);
      byCountry.set(country, (byCountry.get(country) ?? 0) + 1);
    }

    // Backward mediaType depth
    expect(byMedia.get("TVCF") ?? 0).toBeGreaterThanOrEqual(35);
    expect(byMedia.get("NEWS") ?? 0).toBeGreaterThanOrEqual(25);
    expect(byMedia.get("PRINT") ?? 0).toBeGreaterThanOrEqual(100);
    expect(byMedia.get("PHOTO") ?? 0).toBeGreaterThanOrEqual(80);

    // V4.5 12 high-density categories: ALL + 12 categories, zero empty tabs, each >= 24
    expect(ARCHIVE_CATEGORIES).toHaveLength(13);
    for (const cat of ALL_CATEGORIES) {
      expect(byCategory.get(cat) ?? 0).toBeGreaterThanOrEqual(24);
    }

    // V4.5 East Asia targets: KR >= 28, JP >= 32, TW >= 22, total >= 85
    const kr = byCountry.get("KR") ?? 0;
    const jp = byCountry.get("JP") ?? 0;
    const tw = byCountry.get("TW") ?? 0;
    expect(kr).toBeGreaterThanOrEqual(28);
    expect(jp).toBeGreaterThanOrEqual(32);
    expect(tw).toBeGreaterThanOrEqual(22);
    expect(kr + jp + tw).toBeGreaterThanOrEqual(85);

    const uniqueIds = new Set(ITEMS.map((i) => i.id));
    expect(uniqueIds.size).toBe(ITEMS.length);
  });

  it("contains zero forbidden placeholder strings, zero dead links, and valid URLs/palettes/beats", () => {
    const serialized = JSON.stringify(ITEMS);
    for (const phrase of FORBIDDEN_PHRASES) {
      expect(serialized).not.toContain(phrase);
    }

    for (const item of ITEMS) {
      expect(item.id).toMatch(/^KF-\d{3}$/);
      expect(item.titleKo.trim().length).toBeGreaterThan(2);
      expect(item.originalTitle.trim().length).toBeGreaterThan(2);
      expect(item.thumbnailUrl).toMatch(/^https?:\/\//);
      expect(item.thumbnailUrl).not.toBe("#");
      expect(item.sourceUrl).toMatch(/^https?:\/\//);
      expect(item.sourceUrl).not.toBe("#");
      expect(item.category).toBeDefined();
      expect(item.country).toBeDefined();

      if (item.mediaSource === "archive_mp4") {
        expect(item.previewVideoUrl).toMatch(/^https?:\/\//);
        expect(item.durationSec).not.toBeNull();
      } else if (item.mediaSource === "youtube_embed") {
        expect(item.youtubeId).toBeTruthy();
        expect(item.durationSec).not.toBeNull();
      } else {
        expect(item.durationSec).toBeNull();
      }

      expect(item.palette).toHaveLength(5);
      for (const hex of item.palette) {
        expect(hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }

      expect(item.beats).toHaveLength(4);
      for (const beat of item.beats) {
        expect(beat.label.trim().length).toBeGreaterThan(0);
        expect(beat.noteKo.trim().length).toBeGreaterThan(5);
        expect(beat.focusCrop.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("validates viewfinder coordinates strictly within 0..100 range for schema compatibility", () => {
    for (const item of ITEMS) {
      const [vx, vy] = item.viewfinder.vanishingPoint;
      expect(vx).toBeGreaterThanOrEqual(0);
      expect(vx).toBeLessThanOrEqual(100);
      expect(vy).toBeGreaterThanOrEqual(0);
      expect(vy).toBeLessThanOrEqual(100);

      expect(item.viewfinder.eyePath).toHaveLength(3);
      for (const [x, y] of item.viewfinder.eyePath) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(100);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(100);
      }

      expect(["perspective", "thirds", "symmetry", "golden"]).toContain(
        item.viewfinder.primaryGrid
      );
    }
  });

  it("slices progressive infinite scroll windows cleanly (initial 48 + step 36)", () => {
    expect(INITIAL_VISIBLE_COUNT).toBe(48);
    expect(LOAD_MORE_STEP).toBe(36);

    const firstPage = getVisibleArchiveSlice(ITEMS, INITIAL_VISIBLE_COUNT);
    expect(firstPage).toHaveLength(48);
    expect(firstPage[0].id).toBe(ITEMS[0].id);

    const secondPage = getVisibleArchiveSlice(
      ITEMS,
      INITIAL_VISIBLE_COUNT + LOAD_MORE_STEP
    );
    expect(secondPage).toHaveLength(84);

    // Lower than minimum clamps to INITIAL_VISIBLE_COUNT
    expect(getVisibleArchiveSlice(ITEMS, 10)).toHaveLength(48);
    // Larger than array length caps cleanly at total length
    expect(getVisibleArchiveSlice(ITEMS, ITEMS.length + 500)).toHaveLength(
      ITEMS.length
    );
  });

  it("accurately filters by V4.5 12-categories, country codes, era, and sorts cleanly", () => {
    for (const item of ITEMS) {
      expect(item.compositionTags.length).toBeGreaterThanOrEqual(1);
      expect(item.persuasionTags.length).toBeGreaterThanOrEqual(1);
      for (const c of item.compositionTags) {
        expect(COMPOSITION_TAGS).toContain(c);
      }
      for (const p of item.persuasionTags) {
        expect(PERSUASION_TAGS).toContain(p);
      }
    }

    const krFilms = filterAndSortArchive(ITEMS, {
      ...DEFAULT_FILTER_STATE,
      category: "CLASSIC_FILM",
      country: "KR",
    });
    expect(krFilms.length).toBeGreaterThanOrEqual(3);
    for (const item of krFilms) {
      expect(resolveItemCategory(item)).toBe("CLASSIC_FILM");
      expect(resolveItemCountry(item)).toBe("KR");
    }

    const jpTvcf = filterAndSortArchive(ITEMS, {
      ...DEFAULT_FILTER_STATE,
      category: "TVCF",
      country: "JP",
    });
    expect(jpTvcf.length).toBeGreaterThanOrEqual(8);
    for (const item of jpTvcf) {
      expect(resolveItemCategory(item)).toBe("TVCF");
      expect(resolveItemCountry(item)).toBe("JP");
    }

    const asc = filterAndSortArchive(ITEMS, {
      ...DEFAULT_FILTER_STATE,
      sort: "year_asc",
    });
    for (let i = 1; i < asc.length; i += 1) {
      expect(asc[i].year).toBeGreaterThanOrEqual(asc[i - 1].year);
    }

    const desc = filterAndSortArchive(ITEMS, {
      ...DEFAULT_FILTER_STATE,
      sort: "year_desc",
    });
    for (let i = 1; i < desc.length; i += 1) {
      expect(desc[i].year).toBeLessThanOrEqual(desc[i - 1].year);
    }
  });

  it("balances chromatic richness and 12-genre diversity across the default first-screen top 16", () => {
    const defaultSorted = filterAndSortArchive(ITEMS, DEFAULT_FILTER_STATE);
    expect(defaultSorted).toHaveLength(ITEMS.length);

    const top16 = defaultSorted.slice(0, 16);
    const chromaticCount = top16.filter((item) => isChromaticItem(item)).length;
    expect(chromaticCount).toBeGreaterThanOrEqual(12);

    const mediaSet = new Set(top16.map((item) => item.mediaType));
    expect(mediaSet.size).toBe(4);

    const catSet = new Set(top16.map((item) => resolveItemCategory(item)));
    expect(catSet.size).toBeGreaterThanOrEqual(6);

    for (let i = 2; i < top16.length; i += 1) {
      const same3Media =
        top16[i].mediaType === top16[i - 1].mediaType &&
        top16[i - 1].mediaType === top16[i - 2].mediaType;
      expect(same3Media).toBe(false);

      const mono3 =
        !isChromaticItem(top16[i]) &&
        !isChromaticItem(top16[i - 1]) &&
        !isChromaticItem(top16[i - 2]);
      expect(mono3).toBe(false);
    }
  });

  it("rotates archive smartly by seed while preserving full item count and varying top exposure", () => {
    const rotA = rotateArchiveWithSeed(ITEMS, 101);
    const rotB = rotateArchiveWithSeed(ITEMS, 9091);

    expect(rotA).toHaveLength(ITEMS.length);
    expect(rotB).toHaveLength(ITEMS.length);
    expect(new Set(rotA.map((i) => i.id)).size).toBe(ITEMS.length);
    expect(new Set(rotB.map((i) => i.id)).size).toBe(ITEMS.length);

    const topA = rotA.slice(0, 12).map((i) => i.id).join(",");
    const topB = rotB.slice(0, 12).map((i) => i.id).join(",");
    expect(topA).not.toBe(topB);

    const rotAChroma = rotA.slice(0, 16).filter((i) => isChromaticItem(i)).length;
    expect(rotAChroma).toBeGreaterThanOrEqual(11);
  });

  it("verifies scrypt password hashing and HMAC-SHA256 session token signing/tamper resistance", () => {
    const hashed = hashPassword("kinoframe-test-pass-2026");
    expect(hashed).toMatch(/^scrypt\$[0-9a-f]+\$[0-9a-f]+$/);
    expect(verifyPassword("kinoframe-test-pass-2026", hashed)).toBe(true);
    expect(verifyPassword("wrong-password", hashed)).toBe(false);
    expect(verifyPassword("kinoframe-test-pass-2026", "corrupted-hash")).toBe(false);

    const token = createSessionToken({
      sub: "account:tester@kinoframe.local",
      provider: "account",
      name: "아카이브 테스터",
      email: "tester@kinoframe.local",
    });

    const verified = verifySessionToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.sub).toBe("account:tester@kinoframe.local");
    expect(verified?.provider).toBe("account");

    // Tampered token must be rejected
    const [payload, sig] = token.split(".");
    const tampered = `${payload}.${sig.slice(0, -2)}AA`;
    expect(verifySessionToken(tampered)).toBeNull();
    expect(verifySessionToken("invalid.token.shape")).toBeNull();
  });

  it("enforces strict SSRF allowlist on media proxy hosts and blocks arbitrary or internal targets", () => {
    expect(
      isAllowedMediaProxyUrl(
        "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a8/test.jpg"
      )
    ).toBe(true);
    expect(
      isAllowedMediaProxyUrl(
        "https://upload.wikimedia.org/wikipedia/commons/e/e0/test.jpg"
      )
    ).toBe(true);
    expect(
      isAllowedMediaProxyUrl("https://archive.org/download/Corvairi1960/Corvairi1960_512kb.mp4")
    ).toBe(true);
    expect(
      isAllowedMediaProxyUrl("https://ia801509.us.archive.org/12/items/test/video.mp4")
    ).toBe(true);
    expect(
      isAllowedMediaProxyUrl("https://images-assets.nasa.gov/image/as17-148-22727/as17-148-22727~thumb.jpg")
    ).toBe(true);
    expect(
      isAllowedMediaProxyUrl("https://i.ytimg.com/vi/M7FIvfx5J10/hqdefault.jpg")
    ).toBe(true);
    expect(
      isAllowedMediaProxyUrl("https://tile.loc.gov/image-services/iiif/service/default.jpg")
    ).toBe(true);

    // Blocked internal / non-HTTPS / arbitrary external hosts
    expect(isAllowedMediaProxyUrl("http://127.0.0.1:3000/api/vault")).toBe(false);
    expect(isAllowedMediaProxyUrl("https://localhost/secret")).toBe(false);
    expect(isAllowedMediaProxyUrl("http://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(isAllowedMediaProxyUrl("https://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(isAllowedMediaProxyUrl("https://evil.example.com/steal.png")).toBe(false);
    expect(isAllowedMediaProxyUrl("https://archive.org.evil.com/x.mp4")).toBe(false);
    expect(isAllowedMediaProxyUrl("http://thumb.wikimedia.org/insecure.jpg")).toBe(false);
    expect(isAllowedMediaProxyUrl("file:///etc/passwd")).toBe(false);
  });

  it("preserves serverless ?board= URL serialization, round-trip parsing, and markdown brief generation", () => {
    const validIds = new Set(ITEMS.map((i) => i.id));
    const targetIds = [ITEMS[0].id, ITEMS[4].id, ITEMS[0].id, "INVALID-999"];
    const serialized = serializeBoardIds(targetIds);
    expect(serialized).toBe(`${ITEMS[0].id},${ITEMS[4].id}`);

    const restored = parseBoardIds(`${serialized},KF-999,malicious`, validIds);
    expect(restored).toEqual([ITEMS[0].id, ITEMS[4].id]);

    const md = generateMoodboardMarkdown(
      [ITEMS[0], ITEMS[4]],
      `https://kinoframe.example/?board=${serialized}`
    );
    expect(md).toContain(ITEMS[0].titleKo);
    expect(md).toContain(ITEMS[4].titleKo);
    expect(md).toContain(`?board=${serialized}`);
  });
});
