import { describe, expect, it } from "vitest";
import type { BgmCue, Segment } from "@cuesheet/schema";
import {
  bgmCutRange,
  cumulativeCutStarts,
  cutIndexAtTime,
  cutRangeToSeconds,
} from "../../src/lib/bgmCutMapping.js";

function seg(inS: number, outS: number, speed = 1): Segment {
  return { clip: "a.mp4", in: inS, out: outS, speed, volume: 1, subtitle: "" };
}

function cue(start: number, end: number): BgmCue {
  return { file: "bgm.mp3", start, end, volume: 1 };
}

describe("cumulativeCutStarts", () => {
  it("returns just [0] for no segments", () => {
    expect(cumulativeCutStarts([])).toEqual([0]);
  });

  it("accumulates playback seconds (out-in)/speed per cut, with a trailing total", () => {
    // durations: 5, 2 (10/5 at 5x speed), 3
    const segments = [seg(0, 5), seg(0, 10, 5), seg(0, 3)];
    expect(cumulativeCutStarts(segments)).toEqual([0, 5, 7, 10]);
  });
});

describe("cutIndexAtTime", () => {
  const cumStart = [0, 5, 7, 10]; // 3 cuts

  it("returns 0 for a time within the first cut", () => {
    expect(cutIndexAtTime(cumStart, 2)).toBe(0);
  });

  it("returns the middle index for a time within the middle cut", () => {
    expect(cutIndexAtTime(cumStart, 6)).toBe(1);
  });

  it("returns the last cut index for a time within (or at) the final cut", () => {
    expect(cutIndexAtTime(cumStart, 9)).toBe(2);
    expect(cutIndexAtTime(cumStart, 10)).toBe(2);
  });

  it("returns 0 for a single-segment cumStart (no cuts to distinguish)", () => {
    expect(cutIndexAtTime([0, 5], 3)).toBe(0);
  });

  it("returns 0 when cumStart is degenerate (empty array, no valid cut index)", () => {
    expect(cutIndexAtTime([], 3)).toBe(0);
  });
});

describe("bgmCutRange", () => {
  const cumStart = [0, 5, 7, 10];

  it("maps a cue spanning exactly one cut to that single cut index for start and end", () => {
    expect(bgmCutRange(cue(0, 5), cumStart)).toEqual({ startCutIdx: 0, endCutIdx: 0 });
  });

  it("maps a cue spanning multiple cuts to the first/last cut it touches", () => {
    expect(bgmCutRange(cue(2, 9), cumStart)).toEqual({ startCutIdx: 0, endCutIdx: 2 });
  });

  it("pulls the end back by an epsilon so a cue ending exactly on a boundary doesn't spill into the next cut", () => {
    // end=5 exactly on the boundary between cut 0 and cut 1 - should still resolve to cut 0.
    expect(bgmCutRange(cue(0, 5), cumStart)).toEqual({ startCutIdx: 0, endCutIdx: 0 });
  });
});

describe("cutRangeToSeconds", () => {
  const cumStart = [0, 5, 7, 10];

  it("converts a single-cut range back to its exact start/end seconds", () => {
    expect(cutRangeToSeconds(0, 0, cumStart)).toEqual({ start: 0, end: 5 });
  });

  it("converts a multi-cut range to the first cut's start and the last cut's end", () => {
    expect(cutRangeToSeconds(1, 2, cumStart)).toEqual({ start: 5, end: 10 });
  });

  it("falls back to the total duration when endCutIdx is out of range", () => {
    expect(cutRangeToSeconds(0, 99, cumStart)).toEqual({ start: 0, end: 10 });
  });
});
