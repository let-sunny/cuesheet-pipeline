export interface TrimWindow {
  start: number;
  end: number;
}

/**
 * Default zoom window (seconds) for the detail trim bar: the cut's in/out range padded by 30% of
 * its own length on each side, widened to at least TRIM_WINDOW_MIN_S (or the whole clip, if
 * shorter than that), then clamped into [0, durationS] while preserving width where possible.
 *
 * Two-level trim (screen-spec section 3) - on a long clip (e.g. a 920s knitting long-take),
 * mapping the full duration onto the trim bar's width gives sub-pixel handles for a short in/out
 * range (undraggable); this default window keeps the visible range small enough to drag
 * precisely, regardless of how long the source clip is. On a short clip (e.g. 13.7s), the min-
 * width floor just becomes "the whole clip".
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
 * Re-centers the trim window on `centerT` without changing its width - used when the overview
 * bar (the full clip) is clicked/dragged to reposition the detail bar's zoom window. Clamped to
 * stay inside [0, duration].
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

/** The detail bar's default zoom window is the cut's in/out range padded by this fraction of the
 * range's own length on each side. */
const TRIM_WINDOW_PADDING_RATIO = 0.3;
/** The detail bar's zoom window is never narrower than this (seconds) unless the whole clip is
 * shorter, in which case the window is just the whole clip. */
const TRIM_WINDOW_MIN_S = 20;
