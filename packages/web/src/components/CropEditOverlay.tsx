import { useRef } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import type { Crop } from "@cuesheet/schema";

/** Lower bound with a bit of margin, since crop.w/crop.h must be greater than 0.1 in the schema (gt, not gte). */
const MIN_SIZE = 0.11;

type HandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

const HANDLE_IDS: HandleId[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

interface Props {
  crop: Crop;
  /** The container the crop overlay is drawn on (the frame wrapping the video) — the basis for pixel<->ratio conversion. */
  frameRef: RefObject<HTMLDivElement | null>;
  onChange: (crop: Crop) => void;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

/**
 * Transforms resize-handle drag deltas so w==h (square ratio coordinates) is always maintained.
 * When the source and output aspect ratios match (16:9 for this project), a w==h crop has no distortion.
 *
 * - Corner handles (nw/ne/se/sw): anchor the opposite corner and compute the square's side
 *   length from the average of the two drag axes (diagonal movement amount).
 * - Edge handles (n/e/s/w): fix the anchor (the opposite edge) and size from a single axis,
 *   then sync the cross axis to the same size while keeping its center.
 */
function resizeSquare(s: Crop, handle: HandleId, dx: number, dy: number): Crop {
  switch (handle) {
    case "se": {
      const bound = Math.min(1 - s.x, 1 - s.y);
      const size = clamp(s.w + (dx + dy) / 2, MIN_SIZE, bound);
      return { x: s.x, y: s.y, w: size, h: size };
    }
    case "nw": {
      const bound = Math.min(s.x + s.w, s.y + s.h);
      const size = clamp(s.w - (dx + dy) / 2, MIN_SIZE, bound);
      return { x: s.x + s.w - size, y: s.y + s.h - size, w: size, h: size };
    }
    case "ne": {
      const bound = Math.min(1 - s.x, s.y + s.h);
      const size = clamp(s.w + (dx - dy) / 2, MIN_SIZE, bound);
      return { x: s.x, y: s.y + s.h - size, w: size, h: size };
    }
    case "sw": {
      const bound = Math.min(s.x + s.w, 1 - s.y);
      const size = clamp(s.w + (dy - dx) / 2, MIN_SIZE, bound);
      return { x: s.x + s.w - size, y: s.y, w: size, h: size };
    }
    case "e": {
      const size = clamp(s.w + dx, MIN_SIZE, 1 - s.x);
      return { x: s.x, y: fitCrossAxis(size, s.y, s.h), w: size, h: size };
    }
    case "w": {
      const newX = clamp(s.x + dx, 0, s.x + s.w - MIN_SIZE);
      const size = s.x + s.w - newX;
      return { x: s.x + s.w - size, y: fitCrossAxis(size, s.y, s.h), w: size, h: size };
    }
    case "s": {
      const size = clamp(s.h + dy, MIN_SIZE, 1 - s.y);
      return { x: fitCrossAxis(size, s.x, s.w), y: s.y, w: size, h: size };
    }
    case "n": {
      const newY = clamp(s.y + dy, 0, s.y + s.h - MIN_SIZE);
      const size = s.y + s.h - newY;
      return { x: fitCrossAxis(size, s.x, s.w), y: s.y + s.h - size, w: size, h: size };
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

/**
 * The overlay laid over the video in crop-edit mode: uses a box-shadow trick to darken
 * everything outside the crop, and lets the bright rectangle (the current crop area) be
 * adjusted by dragging (move) and 8-directional handles (resize). Coordinates are all
 * computed as 0-1 ratios (relative to frameRef's size) and reported to the parent
 * (VideoPreview) immediately via onChange — the parent manages the apply/cancel commit.
 */
export function CropEditOverlay({ crop, frameRef, onChange }: Props) {
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
      // Moving doesn't touch w/h, so the square (w==h) invariant is preserved automatically.
      onChange({
        x: clamp(s.x + dx, 0, 1 - s.w),
        y: clamp(s.y + dy, 0, 1 - s.h),
        w: s.w,
        h: s.h,
      });
      return;
    }

    onChange(resizeSquare(s, start.handle, dx, dy));
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
