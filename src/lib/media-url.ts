import { KINOFRAME_GH_REPO_SLUG } from "@/lib/media-allowlist";

const RELEASE_ASSET_RE = new RegExp(
  `^https://github\\.com/${KINOFRAME_GH_REPO_SLUG.replace("/", "\\/")}/releases/download/(kinoframe-media-s\\d{2})/(KF-[A-Za-z0-9_-]+\\.(?:mp4|webp))$`
);

export const MEDIA_TAG_RE = /^kinoframe-media-s\d{2}$/;
export const MEDIA_FILE_RE = /^KF-[A-Za-z0-9_-]+\.(mp4|webp)$/;

/**
 * Maps our own GitHub Releases asset URL to the same-origin streaming path `/media/<tag>/<file>`.
 * Same-origin playback serves `video/mp4` (Safari) and keeps the canvas untainted, so a frame can be
 * drawn from the playing <video> without downloading anything again. Other URLs pass through.
 */
export function toStreamingMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(RELEASE_ASSET_RE);
  return m ? `/media/${m[1]}/${m[2]}` : url;
}

export function releaseAssetUrl(tag: string, file: string): string {
  return `https://github.com/${KINOFRAME_GH_REPO_SLUG}/releases/download/${tag}/${file}`;
}
