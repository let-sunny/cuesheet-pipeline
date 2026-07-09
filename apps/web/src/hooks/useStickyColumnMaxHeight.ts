import { useEffect, useState, type RefObject } from "react";

/** Kept below the viewport bottom even once capped, so the column never touches the edge. */
const BOTTOM_MARGIN_PX = 20;
/** Never collapse the column smaller than this, even on a very short viewport. */
const MIN_HEIGHT_PX = 200;

/**
 * Computes a max-height (px) for a `position: sticky` column so its capped height, plus its
 * natural (pre-stick) offset from the top of the viewport, never exceeds the viewport height.
 *
 * A plain CSS `max-height: calc(100vh - Xpx)` (X a small constant like the sticky `top` offset)
 * silently assumes the element is already pinned to that stuck `top` - true only *after* the user
 * has scrolled the page past the element's natural in-flow position. Before that first scroll (the
 * common case: landing on the Edit step and selecting a cut), the element renders at its actual,
 * larger `offsetTop` (page header + step nav + mini timeline strip above it), so the fixed calc()
 * undercounts by that amount and the column's bottom edge still lands below the fold - this is
 * exactly the gap the 2026-07-10 13-inch density pass found (docs/screen-spec.md's baseline-
 * viewport section): the maxHeight cap was sized for the *stuck* position, not the initial one.
 *
 * Recomputed on mount and on window resize only - deliberately *not* via a ResizeObserver on the
 * element itself (tried first, then reverted, see docs/screen-spec.md's baseline-viewport section
 * for the measured incident): the element's own height changing (e.g. swapping Cut settings for
 * BGM settings mid-drag, or a group's content growing/shrinking) does not move its `offsetTop` -
 * offsetTop only depends on layout *above* it (this page's header/step nav/mini timeline strip,
 * which are static outside a window resize), so observing the element's own box just fires the
 * observer on every unrelated content change. That produced a real bug: a `setMaxHeight` update
 * mid-drag (BGM bar drag, which swaps the fields column's content and re-renders on every
 * pointermove) caused a layout shift that triggered the browser's scroll anchoring to nudge the
 * page's scroll position *during* the drag, throwing off which cut row ended up under the pointer.
 */
export function useStickyColumnMaxHeight(ref: RefObject<HTMLElement | null>): number | undefined {
  const [maxHeight, setMaxHeight] = useState<number>();

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const recompute = () => {
      setMaxHeight(Math.max(MIN_HEIGHT_PX, window.innerHeight - el.offsetTop - BOTTOM_MARGIN_PX));
    };
    recompute();

    window.addEventListener("resize", recompute);
    return () => {
      window.removeEventListener("resize", recompute);
    };
  }, [ref]);

  return maxHeight;
}
