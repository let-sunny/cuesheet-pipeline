import type { CueSheet, Segment } from "@cuesheet/schema";

/** Sets patch onto segment i, leaving every other segment untouched. */
export function updateSegmentInSheet(cue: CueSheet, i: number, patch: Partial<Segment>): CueSheet {
  const segments = cue.segments.map((s, idx) => (idx === i ? { ...s, ...patch } : s));
  return { ...cue, segments };
}

/**
 * Duplicates the segment at selectedIndex, inserting the copy right after it (subtitle cleared, so
 * it reads as needing a rewrite) - the "Add segment" button's pure transformation. Returns null
 * when selectedIndex doesn't reference an existing segment (nothing to duplicate).
 */
export function duplicateSegmentAfter(
  cue: CueSheet,
  selectedIndex: number,
): { cue: CueSheet; insertAt: number } | null {
  const source = cue.segments[selectedIndex];
  if (!source) {
    return null;
  }
  const insertAt = selectedIndex + 1;
  const segments = [...cue.segments];
  segments.splice(insertAt, 0, { ...source, subtitle: "" });
  return { cue: { ...cue, segments }, insertAt };
}

/** Removes the segment at index i. Returns null (no-op) when only one segment remains. */
export function removeSegmentAt(cue: CueSheet, i: number): CueSheet | null {
  if (cue.segments.length <= 1) {
    return null;
  }
  const segments = cue.segments.filter((_, idx) => idx !== i);
  return { ...cue, segments };
}

/**
 * Swaps segment i with its neighbor in `direction` (-1 = earlier, 1 = later). Returns null (no-op)
 * when the swap would go out of bounds.
 */
export function swapSegmentAt(
  cue: CueSheet,
  i: number,
  direction: -1 | 1,
): { cue: CueSheet; newIndex: number } | null {
  const target = i + direction;
  if (target < 0 || target >= cue.segments.length) {
    return null;
  }
  const segments = [...cue.segments];
  const a = segments[i];
  const b = segments[target];
  if (!a || !b) {
    return null;
  }
  segments[i] = b;
  segments[target] = a;
  return { cue: { ...cue, segments }, newIndex: target };
}

/** Minimum length (seconds) either side of a split must keep - below this, the split is rejected. */
export const MIN_SPLIT_SIDE_S = 0.2;

/**
 * Splits segment i into two at source-time `at`: [in, at) and [at, out) (the second copy's
 * subtitle is cleared, same convention as duplicateSegmentAfter). Returns null when either side
 * would end up shorter than MIN_SPLIT_SIDE_S.
 */
export function splitSegmentAt(cue: CueSheet, i: number, at: number): CueSheet | null {
  const s = cue.segments[i];
  if (!s) {
    return null;
  }
  if (at - s.in < MIN_SPLIT_SIDE_S || s.out - at < MIN_SPLIT_SIDE_S) {
    return null;
  }
  const first: Segment = { ...s, out: at };
  const second: Segment = { ...s, in: at, subtitle: "" };
  const segments = [...cue.segments];
  segments.splice(i, 1, first, second);
  return { ...cue, segments };
}

/** Clears segment i's crop (sets it to null). */
export function clearSegmentCropAt(cue: CueSheet, i: number): CueSheet {
  const segments = cue.segments.map((s, idx) => (idx === i ? { ...s, crop: null } : s));
  return { ...cue, segments };
}
