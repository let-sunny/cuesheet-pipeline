import { useRef } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import type { Crop } from "@cuesheet/schema";
import { clamp } from "../lib/clamp.js";

type HandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

interface Props {
  crop: Crop;
  /** The container the crop overlay is drawn on (the frame wrapping the video) — the basis for pixel<->ratio conversion. */
  frameRef: RefObject<HTMLDivElement | null>;
  onChange: (crop: Crop) => void;
  /**
   * Target crop.w/crop.h ratio (w/h) to lock to while resizing. Derived by the caller from the
   * project's aspect ratio and the source video's natural dimensions — see
   * @cuesheet/schema's cueSheetSchema superRefine for the underlying invariant (crop.w/crop.h
   * must reproduce the project's aspect ratio once scaled from the source). For same-aspect
   * sources (source aspect === project aspect) this is 1, reproducing the old square-lock
   * behavior exactly. Defaults to 1 if omitted.
   */
  lockRatio?: number;
}

/**
 * The overlay laid over the video in crop-edit mode: uses a box-shadow trick to darken
 * everything outside the crop, and lets the bright rectangle (the current crop area) be
 * adjusted by dragging (move) and 8-directional handles (resize). Coordinates are all
 * computed as 0-1 ratios (relative to frameRef's size) and reported to the parent
 * (VideoPreview) immediately via onChange — the parent manages the apply/cancel commit.
 */
export function CropEditOverlay({ crop, frameRef, onChange, lockRatio = 1 }: Props) {
  const dragStart = useRef<{
    crop: Crop;
    clientX: number;
    clientY: number;
    handle: HandleId | "move";
  } | null>(null);

  const startDrag = (handle: HandleId | "move") => (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = { crop, clientX: e.clientX, clientY: e.clientY, handle };
  };

  const onDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const start = dragStart.current;
    const el = frameRef.current;
    if (!start || !el || e.buttons === 0) {
      return;
    }
    e.stopPropagation();
    const rect = el.getBoundingClientRect();
    const dx = rect.width > 0 ? (e.clientX - start.clientX) / rect.width : 0;
    const dy = rect.height > 0 ? (e.clientY - start.clientY) / rect.height : 0;
    const s = start.crop;

    if (start.handle === "move") {
      // Moving doesn't touch w/h, so the ratio-lock invariant is preserved automatically.
      onChange({
        x: clamp(s.x + dx, 0, 1 - s.w),
        y: clamp(s.y + dy, 0, 1 - s.h),
        w: s.w,
        h: s.h,
      });
      return;
    }

    onChange(resizeLocked(s, start.handle, dx, dy, lockRatio));
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    dragStart.current = null;
  };

  const boxStyle = {
    left: `${crop.x * 100}%`,
    top: `${crop.y * 100}%`,
    width: `${crop.w * 100}%`,
    height: `${crop.h * 100}%`,
  };

  return (
    <div className="crop-edit-overlay">
      <div
        className="crop-edit-box"
        style={boxStyle}
        onPointerDown={startDrag("move")}
        onPointerMove={onDrag}
        onPointerUp={endDrag}
      >
        {HANDLE_IDS.map((id) => (
          <div
            key={id}
            className={`crop-edit-handle handle-${id}`}
            onPointerDown={startDrag(id)}
            onPointerMove={onDrag}
            onPointerUp={endDrag}
          />
        ))}
      </div>
    </div>
  );
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
function resizeLocked(s: Crop, handle: HandleId, dx: number, dy: number, ratio: number): Crop {
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
 * axis's anchor already guarantees that bound), this placement always holds — previously the
 * size itself would get shaved down based on the cross-axis center (causing a bug where a crop
 * already touching the frame boundary via another handle couldn't be expanded just by pulling
 * one edge); this version removes that bug.
 */
function fitCrossAxis(size: number, otherAxisPos: number, otherAxisLen: number): number {
  const center = otherAxisPos + otherAxisLen / 2;
  return clamp(center - size / 2, 0, 1 - size);
}

/** Lower bound with a bit of margin, since crop.w/crop.h must be greater than 0.1 in the schema (gt, not gte). */
const MIN_SIZE = 0.11;

const HANDLE_IDS: HandleId[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
