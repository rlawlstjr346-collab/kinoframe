import { describe, expect, it } from "vitest";
import archiveSnapshot from "@/data/archive-snapshot.json";
import type { ArchiveItem, MediaType } from "@/types/archive";
import {
  COMPOSITION_TAGS,
  DEFAULT_FILTER_STATE,
  PERSUASION_TAGS,
  filterAndSortArchive,
  generateMoodboardMarkdown,
  isChromaticItem,
  parseBoardIds,
  rotateArchiveWithSeed,
  serializeBoardIds,
} from "@/lib/taxonomy";
import { isAllowedMediaProxyUrl } from "@/lib/media-allowlist";

const ITEMS = archiveSnapshot as ArchiveItem[];

const FORBIDDEN_PHRASES = [
  "준비 중",
  "Coming Soon",
  "coming soon",
  "샘플 데이터",
  "샘플 데이터 모드",
];

describe("KINOFRAME Archive Snapshot Contract", () => {
  it("contains at least 120 real verified items covering all 4 media categories with balanced depth", () => {
    expect(ITEMS.length).toBeGreaterThanOrEqual(120);

    const byMedia = new Map<MediaType, number>();
    for (const item of ITEMS) {
      byMedia.set(item.mediaType, (byMedia.get(item.mediaType) ?? 0) + 1);
    }

    expect(byMedia.get("TVCF") ?? 0).toBeGreaterThanOrEqual(28);
    expect(byMedia.get("NEWS") ?? 0).toBeGreaterThanOrEqual(25);
    expect(byMedia.get("PRINT") ?? 0).toBeGreaterThanOrEqual(33);
    expect(byMedia.get("PHOTO") ?? 0).toBeGreaterThanOrEqual(34);

    const uniqueIds = new Set(ITEMS.map((i) => i.id));
    expect(uniqueIds.size).toBe(ITEMS.length);
  });

  it("contains zero forbidden placeholder strings and zero dead '#' or empty links", () => {
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

  it("validates viewfinder coordinates strictly within 0..100 range", () => {
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

  it("accurately cross-filters by dual Korean taxonomy (composition x persuasion x media x era) and sorts cleanly", () => {
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

    const sample = ITEMS[0];
    const crossResult = filterAndSortArchive(ITEMS, {
      ...DEFAULT_FILTER_STATE,
      mediaType: sample.mediaType,
      compositionTags: [sample.compositionTags[0]],
      persuasionTags: [sample.persuasionTags[0]],
    });
    expect(crossResult.length).toBeGreaterThanOrEqual(1);
    for (const matched of crossResult) {
      expect(matched.mediaType).toBe(sample.mediaType);
      expect(matched.compositionTags).toContain(sample.compositionTags[0]);
      expect(matched.persuasionTags).toContain(sample.persuasionTags[0]);
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

  it("balances chromatic richness and multi-media interleaving across the default first-screen top 16", () => {
    const defaultSorted = filterAndSortArchive(ITEMS, DEFAULT_FILTER_STATE);
    expect(defaultSorted).toHaveLength(ITEMS.length);

    const top16 = defaultSorted.slice(0, 16);
    const chromaticCount = top16.filter((item) => isChromaticItem(item)).length;
    expect(chromaticCount).toBeGreaterThanOrEqual(11);

    const mediaSet = new Set(top16.map((item) => item.mediaType));
    expect(mediaSet.size).toBe(4);

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

    // Chromatic balance holds even after smart seed rotation
    const rotAChroma = rotA.slice(0, 16).filter((i) => isChromaticItem(i)).length;
    expect(rotAChroma).toBeGreaterThanOrEqual(11);
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
