import type { BgmCue, Segment } from "@cuesheet/schema";
import { playbackSeconds } from "./segmentTiming.js";

/**
 * Cumulative output-timeline seconds at the start of each cut, plus one trailing entry for the
 * total duration (so cumStart[i] is cut i's start and cumStart[i+1] is its end/the next cut's
 * start, cumStart[segments.length] is the episode's total duration). Used to convert between a
 * bgm cue's stored seconds (the schema/render contract) and the cut-index range shown/edited in
 * the BGM gutter ("Cuts 3-17") — the gutter anchors to cut boundaries, but storage stays seconds.
 */
export function cumulativeCutStarts(segments: Segment[]): number[] {
  const cumStart: number[] = [0];
  for (const seg of segments) {
    cumStart.push((cumStart[cumStart.length - 1] ?? 0) + playbackSeconds(seg));
  }
  return cumStart;
}

/** Which cut index a given output-timeline time falls into (clamped to a valid cut index). */
export function cutIndexAtTime(cumStart: number[], t: number): number {
  const lastCutIdx = cumStart.length - 2;
  if (lastCutIdx < 0) {
    return 0;
  }
  for (let i = 0; i < lastCutIdx; i += 1) {
    if (t < (cumStart[i + 1] ?? Infinity)) {
      return i;
    }
  }
  return lastCutIdx;
}

export interface BgmCutRange {
  startCutIdx: number;
  endCutIdx: number;
}

/** The [startCutIdx, endCutIdx] (inclusive) a bgm cue's seconds currently span. */
export function bgmCutRange(cue: BgmCue, cumStart: number[]): BgmCutRange {
  return {
    startCutIdx: cutIndexAtTime(cumStart, cue.start),
    endCutIdx: cutIndexAtTime(cumStart, Math.max(cue.start, cue.end - 0.0001)),
  };
}

/** Converts a cut-index range (inclusive) back to the seconds stored on a bgm cue - snaps exactly to cut boundaries. */
export function cutRangeToSeconds(startCutIdx: number, endCutIdx: number, cumStart: number[]): { start: number; end: number } {
  const start = cumStart[startCutIdx] ?? 0;
  const end = cumStart[endCutIdx + 1] ?? cumStart[cumStart.length - 1] ?? start;
  return { start, end };
}
