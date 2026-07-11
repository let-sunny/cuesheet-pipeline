import type { CueSheet } from "@cuesheet/schema";

/** Returns whether [Merge with next cut] is possible, and if not, the reason (shown in the disabled
    button's title). Requires the same clip and time adjacency (next cut's in - current out < 2s). */
export type MergeEligibility = { eligible: true } | { eligible: false; reason: string };

/** How close (seconds) the gap between two cuts' in/out has to be to count as "adjacent" when merging. */
export const MERGE_ADJACENCY_GAP_S = 2;

/**
 * Merges segment i with segment i+1 into one segment spanning both (keeps segment i's other
 * fields, extends its `out` to segment i+1's `out`). Purely structural - the caller is responsible
 * for checking computeMergeEligibility and confirming subtitle loss with the user first. Returns
 * null when either segment doesn't exist (index out of range).
 */
export function mergeSegmentAt(cue: CueSheet, i: number): CueSheet | null {
  const current = cue.segments[i];
  const next = cue.segments[i + 1];
  if (!current || !next) {
    return null;
  }
  const merged = { ...current, out: next.out };
  const segments = [...cue.segments];
  segments.splice(i, 2, merged);
  return { ...cue, segments };
}

export function computeMergeEligibility(draft: CueSheet | null, index: number): MergeEligibility {
  if (!draft) {
    return { eligible: false, reason: "No cuesheet" };
  }
  const current = draft.segments[index];
  const next = draft.segments[index + 1];
  if (!current) {
    return { eligible: false, reason: "No cut selected" };
  }
  if (!next) {
    return { eligible: false, reason: "This is the last cut" };
  }
  if (current.clip !== next.clip) {
    return { eligible: false, reason: "Different clips can't be merged" };
  }
  const gap = next.in - current.out;
  if (gap >= MERGE_ADJACENCY_GAP_S) {
    return { eligible: false, reason: `Not adjacent in time (gap ${gap.toFixed(1)}s)` };
  }
  return { eligible: true };
}
