import { useRef } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import * as stylex from "@stylexjs/stylex";
import type { Crop } from "@cuesheet/schema";
import type { CropHandleId } from "../../lib/cropGeometry.js";
import { clamp } from "../../lib/clamp.js";
import { resizeLocked } from "../../lib/cropGeometry.js";
import { styles } from "./CropEditOverlay.styles.js";

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
 *
 * The pixel-delta -> new-Crop math itself (ratio-locked resize, move clamping) lives in the pure,
 * unit-tested `lib/cropGeometry.ts` - this component only turns pointer events into deltas and
 * wires the result back through onChange.
 */
export function CropEditOverlay({ crop, frameRef, onChange, lockRatio = 1 }: Props) {
  const dragStart = useRef<{
    crop: Crop;
    clientX: number;
    clientY: number;
    handle: CropHandleId | "move";
  } | null>(null);

  const startDrag = (handle: CropHandleId | "move") => (e: ReactPointerEvent<HTMLDivElement>) => {
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
    <div {...stylex.props(styles.overlay)} data-testid="crop-edit-overlay">
      <div
        {...stylex.props(styles.box)}
        style={boxStyle}
        onPointerDown={startDrag("move")}
        onPointerMove={onDrag}
        onPointerUp={endDrag}
        data-testid="crop-edit-box"
      >
        {HANDLE_IDS.map((id) => (
          <div
            key={id}
            {...stylex.props(styles.handle, HANDLE_VARIANT_STYLES[id])}
            onPointerDown={startDrag(id)}
            onPointerMove={onDrag}
            onPointerUp={endDrag}
            data-testid={`crop-edit-handle-${id}`}
          />
        ))}
      </div>
    </div>
  );
}

const HANDLE_IDS: CropHandleId[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

const HANDLE_VARIANT_STYLES: Record<CropHandleId, (typeof styles)[keyof typeof styles]> = {
  nw: styles.handleNw,
  n: styles.handleN,
  ne: styles.handleNe,
  e: styles.handleE,
  se: styles.handleSe,
  s: styles.handleS,
  sw: styles.handleSw,
  w: styles.handleW,
};
