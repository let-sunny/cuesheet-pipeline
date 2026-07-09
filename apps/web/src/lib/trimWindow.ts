import { clamp } from "./clamp.js";

export interface TrimWindow {
  start: number;
  end: number;
}

/**
 * Default zoom window (seconds) for TrimStrip's initial viewport: the cut's in/out range padded
 * by 30% of its own length on each side, widened to at least TRIM_WINDOW_MIN_S (or the whole
 * clip, if shorter than that), then clamped into [0, durationS] while preserving width where
 * possible.
 *
 * On a long clip (e.g. a 920s knitting long-take), mapping the full duration onto the strip's
 * width gives sub-pixel handles for a short in/out range (undraggable); this default viewport
 * keeps the visible range small enough to drag precisely, regardless of how long the source clip
 * is. On a short clip (e.g. 13.7s), the min-width floor just becomes "the whole clip" (so the
 * pan control never appears - see `apps/web/src/components/TrimStrip`).
 */
export function computeDefaultTrimWindow(inS: number, outS: number, durationS: number): TrimWindow {
  if (durationS <= 0) {
    return { start: 0, end: 0 };
  }
  const range = Math.max(0, outS - inS);
  const padding = range * TRIM_WINDOW_PADDING_RATIO;
  let start = inS - padding;
  let end = outS + padding;
  const minWidth = Math.min(TRIM_WINDOW_MIN_S, durationS);
  if (end - start < minWidth) {
    const center = (inS + outS) / 2;
    start = center - minWidth / 2;
    end = center + minWidth / 2;
  }
  if (start < 0) {
    end -= start;
    start = 0;
  }
  if (end > durationS) {
    start -= end - durationS;
    end = durationS;
  }
  return { start: Math.max(0, start), end: Math.min(durationS, end) };
}

/**
 * Re-centers `window` on `centerT` without changing its width, clamped to stay inside
 * [0, duration] - used both to jump the viewport when the pan control's trough is clicked, and
 * internally by `zoomViewportCentered` below.
 */
export function moveTrimWindow(window: TrimWindow, duration: number, centerT: number): TrimWindow {
  const width = window.end - window.start;
  let start = centerT - width / 2;
  let end = start + width;
  if (start < 0) {
    end -= start;
    start = 0;
  }
  if (end > duration) {
    start -= end - duration;
    end = duration;
  }
  return { start: Math.max(0, start), end: Math.min(duration, end) };
}

/**
 * Zooms `viewport` by `factor` (>1 = zoom in/narrower, <1 = zoom out/wider) while keeping the
 * time under the cursor (`anchorT`) pinned at the same fractional position within the viewport -
 * the standard "zoom at cursor" pivot used by Ctrl/Cmd+wheel (TrimStrip screen-spec section 4.2,
 * same gesture convention as `MiniTimelineStrip`). Width is clamped to
 * [min(MIN_VIEWPORT_S, duration), duration] before repositioning.
 */
export function zoomViewportAtTime(
  viewport: TrimWindow,
  duration: number,
  anchorT: number,
  factor: number,
): TrimWindow {
  const oldWidth = viewport.end - viewport.start;
  if (oldWidth <= 0 || duration <= 0) {
    return viewport;
  }
  const newWidth = clampViewportWidth(oldWidth / factor, duration);
  const fraction = clamp((anchorT - viewport.start) / oldWidth, 0, 1);
  let start = anchorT - fraction * newWidth;
  let end = start + newWidth;
  if (start < 0) {
    end -= start;
    start = 0;
  }
  if (end > duration) {
    start -= end - duration;
    end = duration;
  }
  return { start: Math.max(0, start), end: Math.min(duration, end) };
}

/**
 * Zooms `viewport` by `factor` and re-centers the result on `centerT` (the playhead lands in the
 * middle of the new viewport) - used by the strip's +/- buttons, which have no cursor position to
 * pivot on (TrimStrip screen-spec section 4.2: "Button zoom centers on the playhead").
 */
export function zoomViewportCentered(
  viewport: TrimWindow,
  duration: number,
  centerT: number,
  factor: number,
): TrimWindow {
  const width = viewport.end - viewport.start;
  const newWidth = clampViewportWidth(width / factor, duration);
  return moveTrimWindow({ start: centerT - newWidth / 2, end: centerT + newWidth / 2 }, duration, centerT);
}

/** The "Fit clip" viewport - the entire clip, [0, duration]. */
export function fitClipViewport(duration: number): TrimWindow {
  return { start: 0, end: Math.max(0, duration) };
}

/**
 * Shifts `viewport` by `deltaT` without changing its width, clamped into [0, duration] - dragging
 * the pan control's thumb *body* (TrimStrip screen-spec section 4.3).
 */
export function panViewport(viewport: TrimWindow, duration: number, deltaT: number): TrimWindow {
  const width = viewport.end - viewport.start;
  let start = viewport.start + deltaT;
  let end = start + width;
  if (start < 0) {
    end -= start;
    start = 0;
  }
  if (end > duration) {
    start -= end - duration;
    end = duration;
  }
  return { start: Math.max(0, start), end: Math.min(duration, end) };
}

/**
 * Moves one edge of `viewport` to `newT` (dragging the pan control thumb's start/end edge resizes
 * the zoom, Premiere's zoom-scroll-bar convention - TrimStrip screen-spec section 4.3), enforcing
 * the same min-width/clamp rules as the wheel/button zoom.
 */
export function resizeViewportEdge(
  viewport: TrimWindow,
  duration: number,
  edge: "start" | "end",
  newT: number,
): TrimWindow {
  const minWidth = Math.min(MIN_VIEWPORT_S, duration);
  let { start, end } = viewport;
  if (edge === "start") {
    start = clamp(newT, 0, end - minWidth);
  } else {
    end = clamp(newT, start + minWidth, duration);
  }
  return { start: Math.max(0, start), end: Math.min(duration, end) };
}

/** Clamps a candidate viewport width into [min(MIN_VIEWPORT_S, duration), duration]. */
export function clampViewportWidth(width: number, duration: number): number {
  return clamp(width, Math.min(MIN_VIEWPORT_S, duration), Math.max(duration, 0));
}

/**
 * Times (seconds) at which to render one filmstrip thumbnail each, spaced at a fixed pixel
 * stride across the strip's rendered width - one thumb per `stridePx`, centered within its cell
 * (TrimStrip screen-spec section 4.1: "one thumb per ~64px"). Empty when there's no usable
 * width/viewport yet.
 */
export function filmstripThumbTimes(viewport: TrimWindow, widthPx: number, stridePx: number): number[] {
  const width = viewport.end - viewport.start;
  if (widthPx <= 0 || width <= 0 || stridePx <= 0) {
    return [];
  }
  const count = Math.max(1, Math.ceil(widthPx / stridePx));
  const stepT = width / count;
  return Array.from({ length: count }, (_, i) => viewport.start + stepT * (i + 0.5));
}

/** TrimStrip's default viewport is the cut's in/out range padded by this fraction of the range's
 * own length on each side. */
const TRIM_WINDOW_PADDING_RATIO = 0.3;
/** TrimStrip's default viewport is never narrower than this (seconds) unless the whole clip is
 * shorter, in which case the viewport is just the whole clip. */
const TRIM_WINDOW_MIN_S = 20;
/** Max zoom - the viewport is never narrower than this (seconds), per screen-spec section 4.2. */
export const MIN_VIEWPORT_S = 1;
/** Minimum gap (seconds) enforced between In and Out while dragging a handle - shared by
 * VideoPreview (Set In/Set Out from playhead) and TrimStrip (handle drag). */
export const MIN_GAP_S = 0.05;
