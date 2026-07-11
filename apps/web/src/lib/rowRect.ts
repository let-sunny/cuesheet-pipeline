/**
 * A cut row's measured viewport rect (top/height, px) — reported upward by CompactSegmentList and
 * consumed by BgmSidePanel (a flex sibling in EditStep, not a parent/child of either) to position
 * its bars against the cut rows without needing DOM access to them itself. Lives in its own module
 * (rather than being imported from either component) so neither owns the other's type.
 */
export interface RowRect {
  top: number;
  height: number;
}
