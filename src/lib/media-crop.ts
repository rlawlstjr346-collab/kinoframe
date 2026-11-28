import type { CSSProperties } from "react";
import type { ArchiveItem, AspectRatio } from "@/types/archive";

const ASPECT_VALUE: Record<AspectRatio, number> = {
  "4:5": 4 / 5,
  "4:3": 4 / 3,
  "3:2": 3 / 2,
  "16:9": 16 / 9,
  "2.39:1": 2.39,
};

/** Width / height of the full encoded frame (bars included). */
export function getFrameAspect(item: Pick<ArchiveItem, "width" | "height" | "aspectRatio">): number {
  if (item.width && item.height && item.width > 0 && item.height > 0) return item.width / item.height;
  return ASPECT_VALUE[item.aspectRatio] ?? 16 / 9;
}

/** Width / height of the visible picture once baked-in letterbox/pillarbox bars are cropped away. */
export function getVisibleAspect(item: Pick<ArchiveItem, "width" | "height" | "aspectRatio" | "crop">): number {
  const frame = getFrameAspect(item);
  const c = item.crop;
  return c && c.w > 0 && c.h > 0 ? (frame * c.w) / c.h : frame;
}

/**
 * Absolute box that scales the full frame so only the crop rectangle fills the parent.
 * The parent must use `aspect-ratio: getVisibleAspect(item)` and `overflow: hidden`.
 */
export function getCropLayerStyle(item: Pick<ArchiveItem, "crop">): CSSProperties {
  const c = item.crop;
  if (!c || c.w <= 0 || c.h <= 0) return { position: "absolute", inset: 0 };
  return {
    position: "absolute",
    left: `${(-c.x / c.w) * 100}%`,
    top: `${(-c.y / c.h) * 100}%`,
    width: `${100 / c.w}%`,
    height: `${100 / c.h}%`,
  };
}
