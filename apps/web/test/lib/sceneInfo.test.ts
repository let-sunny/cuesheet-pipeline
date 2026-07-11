import { describe, expect, it } from "vitest";
import type { Segment } from "@cuesheet/schema";
import type { ClipMoments } from "../../src/api.js";
import { matchSceneInfo, shotTypeLabel } from "../../src/lib/sceneInfo.js";

function seg(clip: string, inS: number, speed = 1): Segment {
  return { clip, in: inS, out: inS + 5, speed, volume: 1, subtitle: "" };
}

function moments(overrides: Partial<ClipMoments> = {}): ClipMoments[] {
  return [
    {
      clip: "clip_01.mp4",
      clipSummary: "A knitting close-up take.",
      moments: [{ inS: 10, outS: 15, shotType: "hand-closeup", memo: "casting on", quality: 4 }],
      monotonousRanges: [{ startS: 100, endS: 160, desc: "long steady knitting" }],
      ...overrides,
    },
  ];
}

describe("matchSceneInfo", () => {
  it("returns none when the segment's clip isn't in the moment data at all", () => {
    const result = matchSceneInfo(seg("missing.mp4", 10), moments());
    expect(result).toEqual({ kind: "none" });
  });

  it("matches the clip by filename only, ignoring a folder path", () => {
    const result = matchSceneInfo(seg("/some/dir/clip_01.mp4", 10), moments());
    expect(result.kind).toBe("moment");
  });

  it("returns a moment match when in falls exactly within a moment's range", () => {
    const result = matchSceneInfo(seg("clip_01.mp4", 12), moments());
    expect(result).toEqual({
      kind: "moment",
      memo: "casting on",
      shotType: "hand-closeup",
      inS: 10,
      outS: 15,
    });
  });

  it("matches within tolerance just outside a moment's range", () => {
    // moment range is [10,15]; in=8 is 2s before start, within the 3s tolerance.
    const result = matchSceneInfo(seg("clip_01.mp4", 8), moments());
    expect(result.kind).toBe("moment");
  });

  it("does not match when outside the moment range plus tolerance", () => {
    // in=5 is 5s before start (10), outside the 3s tolerance - no moment, no monotonous (speed=1),
    // falls through to clip summary.
    const result = matchSceneInfo(seg("clip_01.mp4", 5), moments());
    expect(result).toEqual({ kind: "summary", memo: "A knitting close-up take." });
  });

  it("only checks monotonousRanges when speed is not 1 (a speed cut)", () => {
    // in=120 is inside the monotonous range [100,160], but speed=1 so it's not even checked -
    // falls through to summary instead.
    const noSpeedResult = matchSceneInfo(seg("clip_01.mp4", 120, 1), moments());
    expect(noSpeedResult).toEqual({ kind: "summary", memo: "A knitting close-up take." });

    const speedResult = matchSceneInfo(seg("clip_01.mp4", 120, 8), moments());
    expect(speedResult).toEqual({
      kind: "monotonous",
      memo: "long steady knitting",
      inS: 100,
      outS: 160,
    });
  });

  it("falls back to none when clipSummary is blank and nothing else matches", () => {
    const result = matchSceneInfo(seg("clip_01.mp4", 5), moments({ clipSummary: "   " }));
    expect(result).toEqual({ kind: "none" });
  });
});

describe("shotTypeLabel", () => {
  it("maps every ShotType to a distinct human-readable label", () => {
    expect(shotTypeLabel("hand-closeup")).toBe("Hand");
    expect(shotTypeLabel("object")).toBe("Object");
    expect(shotTypeLabel("cat")).toBe("Cat");
    expect(shotTypeLabel("change")).toBe("Change");
    expect(shotTypeLabel("reveal")).toBe("Reveal");
    expect(shotTypeLabel("wearing")).toBe("Wearing");
    expect(shotTypeLabel("other")).toBe("Other");
  });
});
