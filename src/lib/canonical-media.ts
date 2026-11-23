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

function extractYouTubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = parsed.pathname.split("/").filter(Boolean)[0];
      return id ? id.trim() : null;
    }
    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      const v = parsed.searchParams.get("v");
      if (v) return v.trim();
      const m = parsed.pathname.match(/^\/(?:embed|shorts|live)\/([^/?#]+)/i);
      if (m) return m[1].trim();
    }
  } catch {
    // ignore non-URL strings
  }
  return null;
}

function extractLocalMediaPath(url: string): string | null {
  if (!url.startsWith("/")) return null;
  const cleanPath = url.split(/[?#]/)[0].trim().toLowerCase();
  if (!cleanPath || cleanPath === "/") return null;
  const withoutExt = cleanPath.replace(/\.(?:mp4|webm|webp|jpg|jpeg|png)$/i, "");
  return withoutExt || cleanPath;
}

function extractGithubReleaseClipKey(url: string): string | null {
  const m = url.match(
    /github\.com\/[^/]+\/[^/]+\/releases\/download\/([^/?#]+)\/([^/?#]+?)(?:\.(?:mp4|webm|webp|jpg|jpeg|png))?$/i
  );
  if (!m) return null;
  return `ghrel:${m[1].toLowerCase()}/${m[2].toLowerCase()}`;
}

export function getCanonicalMediaKey(
  input:
    | Pick<ArchiveItem, "id" | "sourceUrl" | "previewVideoUrl" | "thumbnailUrl">
    | { sourceUrl?: string | null; previewVideoUrl?: string | null; thumbnailUrl?: string | null; id?: string }
): string {
  // Distinct GitHub Releases harvested clip assets (multiple cuts from one IA source MUST stay distinct)
  for (const url of [input.previewVideoUrl, input.thumbnailUrl]) {
    if (typeof url === "string" && url.includes("/releases/download/")) {
      const ghKey = extractGithubReleaseClipKey(url);
      if (ghKey) return ghKey;
    }
  }

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

  // Local static loops (/poc-loops/KF-HD-01.mp4 -> local:/poc-loops/kf-hd-01)
  for (const url of [input.previewVideoUrl, input.thumbnailUrl]) {
    if (typeof url === "string" && url.startsWith("/")) {
      const localKey = extractLocalMediaPath(url);
      if (localKey) return `local:${localKey}`;
    }
  }

  // YouTube watch?v=<id> / youtu.be/<id> (preserve video ID so distinct videos never collide!)
  for (const url of urls) {
    const ytId = extractYouTubeVideoId(url);
    if (ytId) return `yt:${ytId}`;
  }

  if (urls[0]) {
    try {
      const u = new URL(urls[0]);
      const vParam = u.searchParams.get("v") || u.searchParams.get("id");
      const queryPart = vParam ? `?id=${vParam.toLowerCase()}` : "";
      return `url:${u.hostname.toLowerCase()}${decodeURIComponent(u.pathname).toLowerCase()}${queryPart}`;
    } catch {
      return `url:${urls[0].toLowerCase()}`;
    }
  }

  return `id:${String(input.id || "").toLowerCase()}`;
}
