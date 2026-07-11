import { describe, expect, it } from "vitest";
import type { BgmCue } from "@cuesheet/schema";
import { assignBgmLanes, laneCount } from "../../src/lib/bgmLanes.js";

function cue(start: number, end: number): BgmCue {
  return { file: "bgm.mp3", start, end, volume: 1 };
}

// 10 equal-length cuts, so cut index i spans seconds [i, i+1).
const cumStart = Array.from({ length: 11 }, (_, i) => i);

describe("assignBgmLanes", () => {
  it("puts a single cue in lane 0", () => {
    const items = assignBgmLanes([cue(0, 3)], cumStart);
    expect(items).toEqual([{ bgmIndex: 0, startCutIdx: 0, endCutIdx: 2, lane: 0 }]);
  });

  it("puts two non-overlapping cues both in lane 0", () => {
    const items = assignBgmLanes([cue(0, 2), cue(3, 5)], cumStart);
    expect(items.map((i) => i.lane)).toEqual([0, 0]);
  });

  it("puts two overlapping cues in separate lanes", () => {
    const items = assignBgmLanes([cue(0, 5), cue(2, 4)], cumStart);
    const byIndex = new Map(items.map((i) => [i.bgmIndex, i]));
    expect(byIndex.get(0)?.lane).toBe(0);
    expect(byIndex.get(1)?.lane).toBe(1);
  });

  it("reuses a lane once its previous cue has ended (greedy interval scheduling)", () => {
    // cue 0: cut 0-1, cue 1: cut 2-3 (overlaps with nothing at the time it's placed, after cue 0
    // already ended) - both should land in lane 0.
    const items = assignBgmLanes([cue(0, 2), cue(2, 4)], cumStart);
    expect(items.every((i) => i.lane === 0)).toBe(true);
  });

  it("handles three mutually overlapping cues by opening three lanes", () => {
    const items = assignBgmLanes([cue(0, 5), cue(0, 5), cue(0, 5)], cumStart);
    expect(new Set(items.map((i) => i.lane)).size).toBe(3);
  });

  it("returns an empty array for no cues", () => {
    expect(assignBgmLanes([], cumStart)).toEqual([]);
  });

  it("processes cues in start-time order regardless of input order", () => {
    // cue starting later is passed first in the input array; lane assignment should still be
    // based on start-time order, not input order.
    const items = assignBgmLanes([cue(5, 7), cue(0, 2)], cumStart);
    const byIndex = new Map(items.map((i) => [i.bgmIndex, i]));
    // Neither overlaps the other, so both land in lane 0 either way - but exercise the sort path.
    expect(byIndex.get(0)?.lane).toBe(0);
    expect(byIndex.get(1)?.lane).toBe(0);
  });
});

describe("laneCount", () => {
  it("is 0 for no items", () => {
    expect(laneCount([])).toBe(0);
  });

  it("is the max lane index + 1", () => {
    const items = assignBgmLanes([cue(0, 5), cue(2, 4), cue(1, 3)], cumStart);
    expect(laneCount(items)).toBe(Math.max(...items.map((i) => i.lane)) + 1);
  });
});
