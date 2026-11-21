export const ALLOWED_MEDIA_PROXY_HOSTS = [
  "thumb.wikimedia.org",
  "upload.wikimedia.org",
  "archive.org",
  "images-assets.nasa.gov",
  "i.ytimg.com",
  "tile.loc.gov",
] as const;

const ALLOWED_EXACT_SET = new Set<string>(ALLOWED_MEDIA_PROXY_HOSTS);

function isIpLiteral(hostname: string): boolean {
  // IPv4 literal or IPv6 bracketed literal
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return true;
  if (hostname.includes(":")) return true;
  return false;
}

export function isAllowedMediaProxyHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!host || isIpLiteral(host)) return false;
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    return false;
  }
  if (ALLOWED_EXACT_SET.has(host)) return true;
  // Internet Archive CDN nodes (*.us.archive.org)
  if (/^[a-z0-9-]+\.us\.archive\.org$/.test(host)) return true;
  if (/^[a-z0-9-]+\.[a-z0-9-]+\.us\.archive\.org$/.test(host)) return true;
  return false;
}

export function isAllowedMediaProxyUrl(rawUrl: string): boolean {
  if (!rawUrl || typeof rawUrl !== "string") return false;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:") return false;
    if (parsed.username || parsed.password) return false;
    if (parsed.port && parsed.port !== "443") return false;
    return isAllowedMediaProxyHost(parsed.hostname);
  } catch {
    return false;
  }
}

export function buildMediaProxyUrl(targetUrl: string, downloadName?: string): string {
  const params = new URLSearchParams({ url: targetUrl });
  if (downloadName) {
    params.set("download", downloadName);
  }
  return `/api/media-proxy?${params.toString()}`;
}
