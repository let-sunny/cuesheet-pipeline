export type BgmDragMode = "move" | "resize-start" | "resize-end";

export interface BgmDragState {
  bgmIndex: number;
  mode: BgmDragMode;
  originStartCutIdx: number;
  originEndCutIdx: number;
  originRowIdx: number;
}

export interface BgmDragRange {
  start: number;
  end: number;
}

/**
 * Starts a BGM-gutter bar drag (move the whole bar, or resize just its start/end edge) - captures
 * the track's cut-index range and the row under the pointer at drag start, both used as the fixed
 * basis every subsequent pointer move (extendBgmDrag) is measured against.
 */
export function startBgmDrag(
  bgmIndex: number,
  mode: BgmDragMode,
  originRange: { startCutIdx: number; endCutIdx: number },
  originRowIdx: number,
): BgmDragState {
  return {
    bgmIndex,
    mode,
    originStartCutIdx: originRange.startCutIdx,
    originEndCutIdx: originRange.endCutIdx,
    originRowIdx,
  };
}

/**
 * Computes the track's next cut-index range as the pointer moves over `rowIdx`, given the drag's
 * starting state and the last valid cut index (`lastIdx`, i.e. `segments.length - 1`). "move"
 * shifts both ends by the same delta (clamped so the track's length is preserved and it stays in
 * bounds); "resize-start"/"resize-end" move only that one edge (clamped so it doesn't cross the
 * other edge or the list's bounds).
 */
export function extendBgmDrag(drag: BgmDragState, rowIdx: number, lastIdx: number): BgmDragRange {
  if (drag.mode === "move") {
    const delta = rowIdx - drag.originRowIdx;
    const length = drag.originEndCutIdx - drag.originStartCutIdx;
    const start = Math.max(0, Math.min(lastIdx - length, drag.originStartCutIdx + delta));
    return { start, end: start + length };
  }
  if (drag.mode === "resize-start") {
    return { start: Math.max(0, Math.min(drag.originEndCutIdx, rowIdx)), end: drag.originEndCutIdx };
  }
  return { start: drag.originStartCutIdx, end: Math.min(lastIdx, Math.max(drag.originStartCutIdx, rowIdx)) };
}

/**
 * Resolves which row index the pointer (`clientY`) is currently over, from each row's measured
 * bottom edge (`null` for a row with no mounted element yet) - the first row whose bottom edge is
 * at or below the pointer wins; past the last row (or if no row matched), the drag clamps to the
 * last row instead of falling off the end of the list.
 */
export function resolveRowIndexFromBounds(rowBottoms: Array<number | null>, clientY: number): number {
  for (let i = 0; i < rowBottoms.length; i += 1) {
    const bottom = rowBottoms[i];
    if (bottom != null && clientY <= bottom) {
      return i;
    }
  }
  return Math.max(0, rowBottoms.length - 1);
}
