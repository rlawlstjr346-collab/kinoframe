import type { ArchiveItem } from "@/types/archive";
import { buildMediaProxyUrl } from "@/lib/media-allowlist";
import { toStreamingMediaUrl } from "@/lib/media-url";
import { formatPreciseTimestamp } from "@/lib/taxonomy";

function loadImageClean(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("IMAGE_LOAD_FAILED"));
    img.src = src;
  });
}

let pngEncoderWarm: Promise<void> | null = null;

/**
 * The browser's first PNG encode pays a one-off start-up cost (~300 ms measured on a 1920x1080
 * frame vs ~25-45 ms afterwards). Encoding a tiny canvas when the viewer opens moves that cost out
 * of the user's click, so the first "프레임 복사" is as fast as the following ones.
 */
export function warmPngEncoder(): Promise<void> {
  pngEncoderWarm ??= new Promise<void>((resolve) => {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    c.getContext("2d")?.fillRect(0, 0, 64, 64);
    c.toBlob(() => resolve(), "image/png");
  });
  return pngEncoderWarm;
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("CANVAS_EXPORT_FAILED"));
    }, "image/png");
  });
}

async function captureOffscreenProxiedVideoFrame(
  proxiedVideoUrl: string,
  targetTimeSec: number
): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const offVideo = document.createElement("video");
    offVideo.crossOrigin = "anonymous";
    offVideo.muted = true;
    offVideo.playsInline = true;
    offVideo.preload = "auto";

    let settled = false;
    const cleanup = () => {
      offVideo.onloadeddata = null;
      offVideo.onseeked = null;
      offVideo.onerror = null;
      try {
        offVideo.pause();
        offVideo.removeAttribute("src");
        offVideo.load();
      } catch {
        // ignore
      }
    };
    const finishErr = (err: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      cleanup();
      reject(err);
    };
    const drawNow = () => {
      if (settled) return;
      if (offVideo.videoWidth <= 0 || offVideo.videoHeight <= 0) {
        finishErr(new Error("OFFSCREEN_VIDEO_EMPTY"));
        return;
      }
      try {
        const c = document.createElement("canvas");
        c.width = offVideo.videoWidth;
        c.height = offVideo.videoHeight;
        const ctx = c.getContext("2d");
        if (!ctx) throw new Error("NO_CANVAS_CONTEXT");
        ctx.drawImage(offVideo, 0, 0, c.width, c.height);
        ctx.getImageData(0, 0, 1, 1);
        settled = true;
        window.clearTimeout(timer);
        cleanup();
        resolve(c);
      } catch (e) {
        finishErr(e instanceof Error ? e : new Error("OFFSCREEN_DRAW_FAILED"));
      }
    };

    const timer = window.setTimeout(
      () => finishErr(new Error("OFFSCREEN_TIMEOUT")),
      6500
    );

    offVideo.onerror = () => finishErr(new Error("OFFSCREEN_LOAD_FAILED"));
    offVideo.onloadeddata = () => {
      const safeTarget =
        Number.isFinite(targetTimeSec) && targetTimeSec > 0.05
          ? Math.min(
              targetTimeSec,
              Number.isFinite(offVideo.duration) && offVideo.duration > 0.2
                ? offVideo.duration - 0.05
                : targetTimeSec
            )
          : 0;
      if (safeTarget > 0.05) {
        offVideo.onseeked = drawNow;
        try {
          offVideo.currentTime = safeTarget;
        } catch {
          drawNow();
        }
      } else {
        drawNow();
      }
    };

    offVideo.src = proxiedVideoUrl;
  });
}

async function resolveFrameCanvas(
  item: ArchiveItem,
  videoEl: HTMLVideoElement | null
): Promise<HTMLCanvasElement> {
  // 1. Draw the playing <video> directly. It streams from the same-origin /media route, so the
  //    canvas is untainted and no byte is downloaded again (~instant).
  if (
    videoEl &&
    videoEl.readyState >= 2 &&
    videoEl.videoWidth > 0 &&
    videoEl.videoHeight > 0
  ) {
    try {
      const c = document.createElement("canvas");
      c.width = videoEl.videoWidth;
      c.height = videoEl.videoHeight;
      const ctx = c.getContext("2d");
      if (ctx) {
        ctx.drawImage(videoEl, 0, 0, c.width, c.height);
        // Verify canvas is not tainted
        ctx.getImageData(0, 0, 1, 1);
        return c;
      }
    } catch {
      // Tainted canvas (foreign host): fall back to an offscreen same-origin copy below.
    }
  }

  // 2. For external archive_mp4 videos (e.g. GitHub Releases), capture exact live currentTime via /api/media-proxy
  if (
    item.mediaSource === "archive_mp4" &&
    item.previewVideoUrl &&
    !item.previewVideoUrl.startsWith("/")
  ) {
    try {
      const targetTime = videoEl?.currentTime ?? 0;
      const streamed = toStreamingMediaUrl(item.previewVideoUrl);
      const proxiedVideo =
        streamed && streamed.startsWith("/") ? streamed : buildMediaProxyUrl(item.previewVideoUrl);
      return await captureOffscreenProxiedVideoFrame(proxiedVideo, targetTime);
    } catch {
      // Fall back cleanly to proxied high-res thumbnail below
    }
  }

  // 3. Load high-resolution thumbnail directly (same-origin local loop) or via allowlisted proxy
  const streamedThumb = toStreamingMediaUrl(item.thumbnailUrl) ?? item.thumbnailUrl;
  const proxySrc = streamedThumb.startsWith("/") ? streamedThumb : buildMediaProxyUrl(item.thumbnailUrl);
  const img = await loadImageClean(proxySrc);
  const c = document.createElement("canvas");
  c.width = img.naturalWidth || 1280;
  c.height = img.naturalHeight || 720;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("NO_CANVAS_CONTEXT");
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

export async function captureRawFramePngBlob(
  item: ArchiveItem,
  videoEl: HTMLVideoElement | null
): Promise<Blob> {
  const frameCanvas = await resolveFrameCanvas(item, videoEl);
  return canvasToPngBlob(frameCanvas);
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(current);
  }
  return lines;
}

export async function captureReferenceCardPngBlob(
  item: ArchiveItem,
  videoEl: HTMLVideoElement | null,
  timestampSec: number | null
): Promise<Blob> {
  const frameCanvas = await resolveFrameCanvas(item, videoEl);

  const cardWidth = 1600;
  const pad = 64;
  const mediaWidth = cardWidth - pad * 2;
  const aspect = frameCanvas.height / Math.max(1, frameCanvas.width);
  const mediaHeight = Math.min(1100, Math.max(540, Math.round(mediaWidth * aspect)));
  const footerHeight = 360;
  const cardHeight = pad + mediaHeight + footerHeight + pad;

  const canvas = document.createElement("canvas");
  canvas.width = cardWidth;
  canvas.height = cardHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("NO_CANVAS_CONTEXT");

  // Darkroom matte background
  ctx.fillStyle = "#09090B";
  ctx.fillRect(0, 0, cardWidth, cardHeight);

  // Subtle matte border
  ctx.strokeStyle = "rgba(244, 241, 234, 0.14)";
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 20, cardWidth - 40, cardHeight - 40);

  // Draw frame preserving aspect ratio centered inside media stage
  const stageX = pad;
  const stageY = pad;
  ctx.fillStyle = "#050507";
  ctx.fillRect(stageX, stageY, mediaWidth, mediaHeight);

  const scale = Math.min(
    mediaWidth / frameCanvas.width,
    mediaHeight / frameCanvas.height
  );
  const drawW = Math.round(frameCanvas.width * scale);
  const drawH = Math.round(frameCanvas.height * scale);
  const drawX = stageX + Math.round((mediaWidth - drawW) / 2);
  const drawY = stageY + Math.round((mediaHeight - drawH) / 2);
  ctx.drawImage(frameCanvas, drawX, drawY, drawW, drawH);

  ctx.strokeStyle = "rgba(244, 241, 234, 0.12)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(stageX, stageY, mediaWidth, mediaHeight);

  // Metadata + Palette + Insight section
  let cursorY = stageY + mediaHeight + 48;

  // Top meta line
  ctx.fillStyle = "#D99B26";
  ctx.font = "600 20px ui-monospace, SFMono-Regular, Menlo, monospace";
  const timeSuffix =
    timestampSec !== null ? `  ·  FRAME ${formatPreciseTimestamp(timestampSec)}` : "";
  ctx.fillText(
    `KINOFRAME ARCHIVE  ·  ${item.id}  ·  ${item.mediaType}  ·  ${item.year}  ·  ${item.brandOrSource}${timeSuffix}`,
    pad,
    cursorY
  );

  // Title
  cursorY += 44;
  ctx.fillStyle = "#F4F1EA";
  ctx.font = "700 36px -apple-system, BlinkMacSystemFont, 'Pretendard', sans-serif";
  const titleLines = wrapTextLines(ctx, item.titleKo, mediaWidth, 1);
  ctx.fillText(titleLines[0] || item.titleKo, pad, cursorY);

  // 5-Color Palette Strip
  cursorY += 32;
  const swatchW = Math.floor(mediaWidth / 5);
  const swatchH = 54;
  item.palette.forEach((hex, idx) => {
    const sx = pad + idx * swatchW;
    ctx.fillStyle = hex;
    ctx.fillRect(sx, cursorY, swatchW - 6, swatchH);
    ctx.strokeStyle = "rgba(244, 241, 234, 0.16)";
    ctx.lineWidth = 1;
    ctx.strokeRect(sx, cursorY, swatchW - 6, swatchH);

    ctx.fillStyle = "#BEB9AE";
    ctx.font = "500 18px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(hex.toUpperCase(), sx + 4, cursorY + swatchH + 26);
  });

  // 1-Line Key Breakdown Insight
  cursorY += swatchH + 68;
  ctx.fillStyle = "#D99B26";
  ctx.font = "600 18px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText("3S HOOK & VISUAL INSIGHT", pad, cursorY);

  cursorY += 34;
  ctx.fillStyle = "#ECE8DF";
  ctx.font = "400 24px -apple-system, BlinkMacSystemFont, 'Pretendard', sans-serif";
  const insightLines = wrapTextLines(
    ctx,
    item.breakdown?.hook3s || item.breakdown?.hook || item.titleKo,
    mediaWidth,
    2
  );
  insightLines.forEach((line, idx) => {
    ctx.fillText(line, pad, cursorY + idx * 34);
  });

  return canvasToPngBlob(canvas);
}

export function downloadBlobAsPng(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1200);
}

/** Starts a browser-managed download from the streaming route (no in-page blob, no Worker buffering). */
export function downloadVideoMp4(item: ArchiveItem): void {
  const filename = `kinoframe-${item.id}.mp4`;
  const videoUrl = item.previewVideoUrl;
  if (!videoUrl) throw new Error("NO_VIDEO_URL");
  const streamed = toStreamingMediaUrl(videoUrl) ?? videoUrl;
  const href = streamed.startsWith("/media/")
    ? `${streamed}?download=1`
    : streamed.startsWith("/")
    ? streamed
    : buildMediaProxyUrl(videoUrl, filename);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function copyPngBlobToClipboard(blob: Blob): Promise<boolean> {
  if (
    typeof navigator === "undefined" ||
    !navigator.clipboard ||
    typeof ClipboardItem === "undefined"
  ) {
    return false;
  }
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  } catch {
    return false;
  }
}
