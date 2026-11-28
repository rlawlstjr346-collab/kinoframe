import { MEDIA_FILE_RE, MEDIA_TAG_RE, releaseAssetUrl } from "@/lib/media-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME: Record<string, string> = { mp4: "video/mp4", webp: "image/webp" };
const SIGNED_URL_TTL_MS = 40 * 60_000; // GitHub's signed asset URLs live ~60 min
const signedUrlMemo = new Map<string, { url: string; at: number }>();
const PASS_HEADERS = ["content-length", "content-range", "etag", "last-modified"];

async function resolveSignedUrl(origin: string, fresh: boolean): Promise<string | null> {
  const hit = signedUrlMemo.get(origin);
  if (!fresh && hit && Date.now() - hit.at < SIGNED_URL_TTL_MS) return hit.url;
  const res = await fetch(origin, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(8000) });
  const location = res.headers.get("location");
  if (res.status < 300 || res.status >= 400 || !location) return null;
  const url = new URL(location, origin);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".githubusercontent.com")) return null;
  signedUrlMemo.set(origin, { url: url.toString(), at: Date.now() });
  return url.toString();
}

/**
 * Same-origin streaming passthrough for our GitHub Releases media: Range requests are forwarded and the
 * upstream body is piped through untouched (no buffering), with the correct Content-Type.
 */
export async function GET(req: Request, { params }: { params: Promise<{ tag: string; file: string }> }) {
  const { tag, file } = await params;
  const ext = MEDIA_FILE_RE.exec(file)?.[1];
  if (!MEDIA_TAG_RE.test(tag) || !ext) return new Response("Not found", { status: 404 });

  const origin = releaseAssetUrl(tag, file);
  const range = req.headers.get("range");
  const upstreamHeaders: Record<string, string> = { "User-Agent": "KinoframeMediaStream/1.0" };
  if (range) upstreamHeaders.Range = range;

  let upstream: Response | null = null;
  for (const fresh of [false, true]) {
    const signed = await resolveSignedUrl(origin, fresh).catch(() => null);
    if (!signed) break;
    upstream = await fetch(signed, { headers: upstreamHeaders, signal: AbortSignal.timeout(20000) }).catch(() => null);
    // An expired signature answers 403: re-sign once.
    if (upstream && (upstream.ok || upstream.status === 416)) break;
  }
  if (!upstream || !(upstream.ok || upstream.status === 416)) {
    return new Response("Upstream media unavailable", { status: 502 });
  }

  const headers = new Headers({
    "Content-Type": MIME[ext],
    "Accept-Ranges": "bytes",
    "Access-Control-Allow-Origin": "*",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "Cache-Control": "public, max-age=604800, immutable",
  });
  for (const name of PASS_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (new URL(req.url).searchParams.has("download")) {
    headers.set("Content-Disposition", `attachment; filename="kinoframe-${file}"`);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}

export async function HEAD(req: Request, ctx: { params: Promise<{ tag: string; file: string }> }) {
  const res = await GET(req, ctx);
  res.body?.cancel();
  return new Response(null, { status: res.status, headers: res.headers });
}
