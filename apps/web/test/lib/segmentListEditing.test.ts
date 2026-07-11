import { describe, expect, it } from "vitest";
import {
  clearSegmentCropAt,
  duplicateSegmentAfter,
  removeSegmentAt,
  splitSegmentAt,
  swapSegmentAt,
  updateSegmentInSheet,
} from "../../src/lib/segmentListEditing.js";
import { makeCueSheet } from "../helpers/fixtures.js";

function threeSegmentSheet() {
  return makeCueSheet({
    segments: [
      { clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "one" },
      { clip: "a.mp4", in: 5, out: 10, speed: 1, volume: 1, subtitle: "two" },
      { clip: "a.mp4", in: 10, out: 15, speed: 1, volume: 1, subtitle: "three" },
    ],
  });
}

describe("updateSegmentInSheet", () => {
  it("patches only the targeted segment", () => {
    const cue = threeSegmentSheet();
    const result = updateSegmentInSheet(cue, 1, { subtitle: "changed" });
    expect(result.segments[0]?.subtitle).toBe("one");
    expect(result.segments[1]?.subtitle).toBe("changed");
    expect(result.segments[2]?.subtitle).toBe("three");
  });
});

describe("duplicateSegmentAfter", () => {
  it("inserts a copy of the selected segment right after it, with subtitle cleared", () => {
    const cue = threeSegmentSheet();
    const result = duplicateSegmentAfter(cue, 0);
    expect(result?.insertAt).toBe(1);
    expect(result?.cue.segments.length).toBe(4);
    expect(result?.cue.segments[1]).toMatchObject({ clip: "a.mp4", in: 0, out: 5, subtitle: "" });
    expect(result?.cue.segments[2]?.subtitle).toBe("two");
  });

  it("returns null when selectedIndex doesn't reference a segment", () => {
    const cue = threeSegmentSheet();
    expect(duplicateSegmentAfter(cue, 99)).toBeNull();
  });
});

describe("removeSegmentAt", () => {
  it("removes the segment at the given index", () => {
    const cue = threeSegmentSheet();
    const result = removeSegmentAt(cue, 1);
    expect(result?.segments.map((s) => s.subtitle)).toEqual(["one", "three"]);
  });

  it("returns null (no-op) when only one segment remains", () => {
    const cue = makeCueSheet();
    expect(removeSegmentAt(cue, 0)).toBeNull();
  });
});

describe("swapSegmentAt", () => {
  it("swaps a segment with its next neighbor", () => {
    const cue = threeSegmentSheet();
    const result = swapSegmentAt(cue, 0, 1);
    expect(result?.newIndex).toBe(1);
    expect(result?.cue.segments.map((s) => s.subtitle)).toEqual(["two", "one", "three"]);
  });

  it("swaps a segment with its previous neighbor", () => {
    const cue = threeSegmentSheet();
    const result = swapSegmentAt(cue, 2, -1);
    expect(result?.newIndex).toBe(1);
    expect(result?.cue.segments.map((s) => s.subtitle)).toEqual(["one", "three", "two"]);
  });

  it("returns null when moving past the start", () => {
    const cue = threeSegmentSheet();
    expect(swapSegmentAt(cue, 0, -1)).toBeNull();
  });

  it("returns null when moving past the end", () => {
    const cue = threeSegmentSheet();
    expect(swapSegmentAt(cue, 2, 1)).toBeNull();
  });
});

describe("splitSegmentAt", () => {
  it("splits a segment into two at the given source time, clearing the second half's subtitle", () => {
    const cue = threeSegmentSheet();
    const result = splitSegmentAt(cue, 0, 2);
    expect(result?.segments.length).toBe(4);
    expect(result?.segments[0]).toMatchObject({ in: 0, out: 2, subtitle: "one" });
    expect(result?.segments[1]).toMatchObject({ in: 2, out: 5, subtitle: "" });
  });

  it("returns null when the split point leaves the first half too short", () => {
    const cue = threeSegmentSheet();
    expect(splitSegmentAt(cue, 0, 0.1)).toBeNull();
  });

  it("returns null when the split point leaves the second half too short", () => {
    const cue = threeSegmentSheet();
    expect(splitSegmentAt(cue, 0, 4.9)).toBeNull();
  });

  it("returns null for an out-of-range index", () => {
    const cue = threeSegmentSheet();
    expect(splitSegmentAt(cue, 99, 2)).toBeNull();
  });
});

describe("clearSegmentCropAt", () => {
  it("sets the targeted segment's crop to null, leaving others untouched", () => {
    const cue = makeCueSheet({
      segments: [
        { clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "", crop: { x: 0, y: 0, w: 0.5, h: 0.5 } },
      ],
    });
    const result = clearSegmentCropAt(cue, 0);
    expect(result.segments[0]?.crop).toBeNull();
  });
});
