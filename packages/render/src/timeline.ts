import type { CueSheet } from "@cuesheet/schema";

/** One segment's placement on the OUTPUT (post-speed) timeline, in seconds. */
export interface SegmentOutputTiming {
  index: number;
  /** Cumulative sum of prior segments' (out-in)/speed - see computeSegmentOutputTimings. */
  startS: number;
  /** This segment's own output duration: (out-in)/speed. */
  durationS: number;
}

/**
 * Computes each segment's start time and duration on the OUTPUT (post-speed) timeline - the
 * shared offset math behind BGM ducking window placement (ducking.ts's deriveDuckingWindows),
 * narration audio placement (plan.ts's adelay offsets), and title placement in a two-pass render
 * (twoPass.ts). Previously this cumulative-sum loop was hand-duplicated in both plan.ts and
 * ducking.ts (`segmentOffset += (s.out - s.in) / s.speed`) - extracted here so all three call
 * sites can never drift apart.
 *
 * v1 constraint (pre-existing, unchanged by this extraction): intro's duration can't be known
 * without probing the file, so it is NOT included in startS - segment 0's startS is always 0,
 * even when an intro clip precedes it in the actual rendered output. Every call site inherits
 * this same limitation.
 */
export function computeSegmentOutputTimings(cue: CueSheet): SegmentOutputTiming[] {
  const timings: SegmentOutputTiming[] = [];
  let offset = 0;
  cue.segments.forEach((s, index) => {
    const durationS = (s.out - s.in) / s.speed;
    timings.push({ index, startS: offset, durationS });
    offset += durationS;
  });
  return timings;
}
