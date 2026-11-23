import { NextRequest, NextResponse } from "next/server";
import { isAllowedMediaProxyUrl } from "@/lib/media-allowlist";

export const runtime = "nodejs";

const USER_AGENT =
  "KinoframeMediaProxy/1.0 (+https://github.com/rlawlstjr346-collab/kinoframe; frame-capture-proxy)";
const MAX_REDIRECTS = 5;

function inferMimeFromUrl(url: string, upstreamType: string | null): string {
  const clean = (upstreamType || "").split(";")[0].trim().toLowerCase();
  if (clean && clean !== "application/octet-stream" && clean !== "binary/octet-stream") {
    return upstreamType!;
  }
  const pathPart = url.split("?")[0].toLowerCase();
  if (pathPart.endsWith(".mp4")) return "video/mp4";
  if (pathPart.endsWith(".webm")) return "video/webm";
  if (pathPart.endsWith(".webp")) return "image/webp";
  if (pathPart.endsWith(".png")) return "image/png";
  if (pathPart.endsWith(".jpg") || pathPart.endsWith(".jpeg")) return "image/jpeg";
  return upstreamType || "application/octet-stream";
}

async function fetchWithSafeRedirects(
  initialUrl: string,
  rangeHeader: string | null
): Promise<Response> {
  let currentUrl = initialUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (!isAllowedMediaProxyUrl(currentUrl)) {
      throw new Error("BLOCKED_REDIRECT_HOST");
    }

    const headers: Record<string, string> = {
      "User-Agent": USER_AGENT,
      Accept: "image/*,video/*,*/*;q=0.8",
    };
    if (rangeHeader) {
      headers["Range"] = rangeHeader;
    }

    const res = await fetch(currentUrl, {
      method: "GET",
      headers,
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });

    if (
      res.status === 301 ||
      res.status === 302 ||
      res.status === 303 ||
      res.status === 307 ||
      res.status === 308
    ) {
      const location = res.headers.get("location");
      if (!location) {
        return res;
      }
      const nextUrl = new URL(location, currentUrl).toString();
      if (res.body) {
        try {
          await res.body.cancel();
        } catch {
          // ignore
        }
      }
      currentUrl = nextUrl;
      continue;
    }

    return res;
  }

  throw new Error("TOO_MANY_REDIRECTS");
}

export async function GET(req: NextRequest) {
  const targetUrl = req.nextUrl.searchParams.get("url");
  const downloadName = req.nextUrl.searchParams.get("download");

  if (!targetUrl || !isAllowedMediaProxyUrl(targetUrl)) {
    return NextResponse.json(
      { error: "허용되지 않은 미디어 도메인입니다." },
      { status: 403 }
    );
  }

  try {
    const rangeHeader = req.headers.get("range");
    const upstream = await fetchWithSafeRedirects(targetUrl, rangeHeader);

    if (!upstream.ok && upstream.status !== 206) {
      return NextResponse.json(
        { error: `원본 미디어 응답 오류 (HTTP ${upstream.status})` },
        { status: 502 }
      );
    }

    const headers = new Headers();
    const contentType = inferMimeFromUrl(
      targetUrl,
      upstream.headers.get("content-type")
    );
    headers.set("Content-Type", contentType);
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Cache-Control", "public, max-age=3600, s-maxage=86400");
    headers.set("Cross-Origin-Resource-Policy", "cross-origin");

    const contentRange = upstream.headers.get("content-range");
    if (contentRange) headers.set("Content-Range", contentRange);

    const acceptRanges = upstream.headers.get("accept-ranges");
    if (acceptRanges) headers.set("Accept-Ranges", acceptRanges);

    if (downloadName) {
      const safeName = downloadName
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .slice(0, 100);
      headers.set("Content-Disposition", `attachment; filename="${safeName}"`);
    }

    const rawLength = Number(upstream.headers.get("content-length") || "0");
    // Buffer <= 25MB payloads cleanly (avoids Next.js ReadableStream stall on 302 GitHub Releases assets)
    if (rawLength > 0 && rawLength <= 25 * 1024 * 1024) {
      const buf = Buffer.from(await upstream.arrayBuffer());
      headers.set("Content-Length", String(buf.byteLength));
      return new NextResponse(buf, {
        status: upstream.status,
        headers,
      });
    }

    if (rawLength > 0) {
      headers.set("Content-Length", String(rawLength));
    }

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "PROXY_ERROR";
    if (msg === "BLOCKED_REDIRECT_HOST") {
      return NextResponse.json(
        { error: "허용되지 않은 리다이렉트 대상입니다." },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { error: "미디어를 프록시로 불러오지 못했습니다." },
      { status: 502 }
    );
  }
}
