import { describe, expect, it } from "vitest";
import type { Segment } from "@cuesheet/schema";
import { cumulativeCutStarts } from "../../src/lib/bgmCutMapping.js";
import {
  computeCurrentOutputPosition,
  pickActiveSlot,
  pickPreloadSlot,
  resolveProgressClickTarget,
} from "../../src/lib/sequenceScheduling.js";

function seg(overrides: Partial<Segment> = {}): Segment {
  return { clip: "a.mp4", in: 0, out: 10, speed: 1, volume: 1, subtitle: "", ...overrides };
}

describe("pickActiveSlot", () => {
  it("stays on the front slot when it already holds the target clip", () => {
    expect(pickActiveSlot(["a.mp4", "b.mp4"], 0, "a.mp4")).toBe(0);
  });

  it("swaps to the back slot when that one holds the target clip", () => {
    expect(pickActiveSlot(["a.mp4", "b.mp4"], 0, "b.mp4")).toBe(1);
  });

  it("falls back to the front slot when neither slot holds the clip (will load into it)", () => {
    expect(pickActiveSlot(["a.mp4", "b.mp4"], 0, "c.mp4")).toBe(0);
    expect(pickActiveSlot([null, null], 1, "c.mp4")).toBe(1);
  });
});

describe("pickPreloadSlot", () => {
  it("returns the idle slot when the next clip isn't loaded anywhere yet", () => {
    expect(pickPreloadSlot(["a.mp4", null], 0, "b.mp4")).toBe(1);
    expect(pickPreloadSlot([null, "b.mp4"], 1, "a.mp4")).toBe(0);
  });

  it("returns null when the next clip is already sitting in the idle slot", () => {
    expect(pickPreloadSlot(["a.mp4", "b.mp4"], 0, "b.mp4")).toBeNull();
  });

  it("returns null when the next clip is (unusually) already the active slot's clip", () => {
    expect(pickPreloadSlot(["a.mp4", "a.mp4"], 0, "a.mp4")).toBeNull();
  });

  it("returns null when there is no next cut", () => {
    expect(pickPreloadSlot(["a.mp4", null], 0, undefined)).toBeNull();
  });
});

describe("computeCurrentOutputPosition", () => {
  it("adds elapsed source time (converted by speed) to the cut's own output-timeline start", () => {
    const segments = [seg({ out: 5 }), seg({ in: 5, out: 15, speed: 2 })];
    const cumStart = cumulativeCutStarts(segments); // [0, 5, 10]
    // 3s into the second cut's source time (in=5, videoNow=8) at 2x speed -> 1.5s of output time.
    const pos = computeCurrentOutputPosition(cumStart, 1, segments[1], 8, 10);
    expect(pos).toBeCloseTo(5 + 1.5, 6);
  });

  it("clamps to the cut's own start if videoNow is behind segment.in (shouldn't normally happen)", () => {
    const segments = [seg({ out: 5 })];
    const cumStart = cumulativeCutStarts(segments);
    expect(computeCurrentOutputPosition(cumStart, 0, segments[0], -1, 5)).toBe(0);
  });

  it("falls back to the total when there is no current segment (playback ended)", () => {
    expect(computeCurrentOutputPosition([0, 5], 1, undefined, 0, 5)).toBe(5);
  });
});

describe("resolveProgressClickTarget", () => {
  const segments = [seg({ out: 5 }), seg({ in: 5, out: 10 }), seg({ in: 10, out: 20, speed: 2 })];
  const cumStart = cumulativeCutStarts(segments); // [0, 5, 10, 15] (last cut plays 10s source / 2x = 5s output)
  const total = 15;

  it("maps ratio 0 to the very start of the first cut", () => {
    expect(resolveProgressClickTarget(segments, cumStart, total, 0)).toEqual({ index: 0, sourceTime: 0 });
  });

  it("maps a mid-timeline ratio to the right cut and source offset", () => {
    // ratio 0.5 -> targetOutput=7.5, which falls in cut 1 (output [5,10)) at offset 2.5 -> source 5+2.5=7.5
    const target = resolveProgressClickTarget(segments, cumStart, total, 0.5);
    expect(target).toEqual({ index: 1, sourceTime: 7.5 });
  });

  it("converts output-time offset to source-time via the target cut's own speed", () => {
    // ratio close to the end lands in cut 2 (output [10,15), speed 2x) - e.g. targetOutput=12
    // -> offset 2 output-seconds into cut 2 -> 4 source-seconds -> sourceTime = 10+4 = 14.
    const target = resolveProgressClickTarget(segments, cumStart, total, 12 / total);
    expect(target?.index).toBe(2);
    expect(target?.sourceTime).toBeCloseTo(14, 6);
  });

  it("clamps an out-of-range ratio (>1 or <0) into the valid timeline", () => {
    expect(resolveProgressClickTarget(segments, cumStart, total, 2)).toEqual({ index: 2, sourceTime: 20 });
    expect(resolveProgressClickTarget(segments, cumStart, total, -1)).toEqual({ index: 0, sourceTime: 0 });
  });

  it("returns null for an empty segment list or a zero-length timeline", () => {
    expect(resolveProgressClickTarget([], [0], 0, 0.5)).toBeNull();
    expect(resolveProgressClickTarget(segments, cumStart, 0, 0.5)).toBeNull();
  });
});
