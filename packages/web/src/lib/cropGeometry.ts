import type { Crop } from "@cuesheet/schema";
import { clamp } from "./clamp.js";

export type CropHandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

/**
 * Target crop.w/crop.h ratio (w/h) to lock the crop box to while resizing/creating one, derived
 * from the project's aspect ratio and the source video's natural dimensions - see
 * @cuesheet/schema's cueSheetSchema superRefine for the underlying invariant (crop.w/crop.h must
 * reproduce the project's aspect ratio once scaled from the source). For same-aspect sources
 * (the common case for this project) this is 1, the old square-lock behavior. Falls back to 1
 * until the video's metadata has loaded (naturalSize is null).
 */
export function computeLockRatio(
  projectWidth: number,
  projectHeight: number,
  naturalSize: { width: number; height: number } | null,
): number {
  if (naturalSize && naturalSize.width > 0 && naturalSize.height > 0) {
    return (projectWidth * naturalSize.height) / (projectHeight * naturalSize.width);
  }
  return 1;
}

/** The largest ratio-locked crop box (centered) that fits inside the full 0-1 frame. */
export function maxCropForRatio(ratio: number): Crop {
  const w = ratio >= 1 ? 1 : ratio;
  const h = ratio >= 1 ? 1 / ratio : 1;
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
}

/**
 * Transforms resize-handle drag deltas so crop.w/crop.h always stays equal to `ratio`. With
 * ratio===1 this reduces to the old square-lock (w===h) behavior; more generally, w and h are
 * scaled together so their ratio holds. dy is converted to width-equivalent units via
 * `dy * ratio` so the two drag axes combine correctly for any ratio (matches the old
 * `(dx+dy)/2` when ratio===1).
 *
 * - Corner handles (nw/ne/se/sw): anchor the opposite corner and compute the size from the
 *   average of the two (ratio-normalized) drag axes.
 * - Edge handles (n/e/s/w): fix the anchor (the opposite edge) and size from a single axis,
 *   then fit the cross axis to the ratio-derived size while keeping its center.
 */
export function resizeLocked(s: Crop, handle: CropHandleId, dx: number, dy: number, ratio: number): Crop {
  const dyW = dy * ratio; // dy expressed in width-equivalent units
  switch (handle) {
    case "se": {
      const bound = Math.min(1 - s.x, (1 - s.y) * ratio);
      const w = clamp(s.w + (dx + dyW) / 2, MIN_SIZE, bound);
      return { x: s.x, y: s.y, w, h: w / ratio };
    }
    case "nw": {
      const bound = Math.min(s.x + s.w, (s.y + s.h) * ratio);
      const w = clamp(s.w - (dx + dyW) / 2, MIN_SIZE, bound);
      const h = w / ratio;
      return { x: s.x + s.w - w, y: s.y + s.h - h, w, h };
    }
    case "ne": {
      const bound = Math.min(1 - s.x, (s.y + s.h) * ratio);
      const w = clamp(s.w + (dx - dyW) / 2, MIN_SIZE, bound);
      const h = w / ratio;
      return { x: s.x, y: s.y + s.h - h, w, h };
    }
    case "sw": {
      const bound = Math.min(s.x + s.w, (1 - s.y) * ratio);
      const w = clamp(s.w + (dyW - dx) / 2, MIN_SIZE, bound);
      const h = w / ratio;
      return { x: s.x + s.w - w, y: s.y, w, h };
    }
    case "e": {
      const w = clamp(s.w + dx, MIN_SIZE, 1 - s.x);
      const h = w / ratio;
      return { x: s.x, y: fitCrossAxis(h, s.y, s.h), w, h };
    }
    case "w": {
      const newX = clamp(s.x + dx, 0, s.x + s.w - MIN_SIZE);
      const w = s.x + s.w - newX;
      const h = w / ratio;
      return { x: s.x + s.w - w, y: fitCrossAxis(h, s.y, s.h), w, h };
    }
    case "s": {
      const h = clamp(s.h + dy, MIN_SIZE, 1 - s.y);
      const w = h * ratio;
      return { x: fitCrossAxis(w, s.x, s.w), y: s.y, w, h };
    }
    case "n": {
      const newY = clamp(s.y + dy, 0, s.y + s.h - MIN_SIZE);
      const h = s.y + s.h - newY;
      const w = h * ratio;
      return { x: fitCrossAxis(w, s.x, s.w), y: s.y + s.h - h, w, h };
    }
    default:
      return s;
  }
}

/**
 * Places the size determined by an edge-handle drag (size, decided solely by the drag axis's
 * own anchor) on the cross axis without shrinking it, using "keep the current center as much as
 * possible, and push inward if it goes outside the frame." Since size is always <=1 (the drag
 * axis's anchor already guarantees that bound), this placement always holds - previously the
 * size itself would get shaved down based on the cross-axis center (causing a bug where a crop
 * already touching the frame boundary via another handle couldn't be expanded just by pulling
 * one edge); this version removes that bug.
 */
export function fitCrossAxis(size: number, otherAxisPos: number, otherAxisLen: number): number {
  const center = otherAxisPos + otherAxisLen / 2;
  return clamp(center - size / 2, 0, 1 - size);
}

/** Lower bound with a bit of margin, since crop.w/crop.h must be greater than 0.1 in the schema (gt, not gte). */
const MIN_SIZE = 0.11;
