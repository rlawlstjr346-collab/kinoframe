import type { ArchiveItem } from "@/types/archive";

function extractIaIdentifier(url: string): string | null {
  const m = url.match(/archive\.org\/(?:details|download|services\/img)\/([^/?#]+)/i);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]).trim().toLowerCase();
  } catch {
    return m[1].trim().toLowerCase();
  }
}

function extractWikimediaStem(url: string): string | null {
  if (!/(?:wikimedia|wikipedia)\.org/i.test(url)) return null;
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const fileSeg =
      segments.find((seg) => /^File:/i.test(seg)) ||
      segments.find((seg) => /\.(?:webm|mp4|ogv|jpg|jpeg|png|webp|gif)$/i.test(seg)) ||
      segments[segments.length - 1] ||
      "";
    const decoded = decodeURIComponent(fileSeg)
      .replace(/^File:/i, "")
      .replace(/^\d+px-/i, "")
      .replace(/\.(?:webm|mp4|ogv|jpg|jpeg|png|webp|gif)(?:\.\d+p\.[a-z0-9]+\.webm)?$/i, "")
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/g, "");
    return decoded.length >= 2 ? decoded : null;
  } catch {
    return null;
  }
}

function extractNasaId(url: string): string | null {
  const m = url.match(/nasa\.gov\/(?:details|video|image)\/([^/?#]+)/i);
  if (!m) return null;
  return m[1].trim().toLowerCase();
}

export function getCanonicalMediaKey(
  input:
    | Pick<ArchiveItem, "id" | "sourceUrl" | "previewVideoUrl" | "thumbnailUrl">
    | { sourceUrl?: string | null; previewVideoUrl?: string | null; thumbnailUrl?: string | null; id?: string }
): string {
  const urls = [input.sourceUrl, input.previewVideoUrl, input.thumbnailUrl].filter(
    (u): u is string => typeof u === "string" && u.length > 0
  );

  for (const url of urls) {
    const ia = extractIaIdentifier(url);
    if (ia) return `ia:${ia}`;
  }

  for (const url of urls) {
    const wm = extractWikimediaStem(url);
    if (wm) return `wm:${wm}`;
  }

  for (const url of urls) {
    const nasa = extractNasaId(url);
    if (nasa) return `nasa:${nasa}`;
  }

  if (urls[0]) {
    try {
      const u = new URL(urls[0]);
      return `url:${u.hostname.toLowerCase()}${decodeURIComponent(u.pathname).toLowerCase()}`;
    } catch {
      return `url:${urls[0].toLowerCase()}`;
    }
  }

  return `id:${String(input.id || "").toLowerCase()}`;
}
