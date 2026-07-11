import { describe, expect, it } from "vitest";
import { mergeSegmentAt } from "../../src/lib/segmentMerge.js";
import { makeCueSheet } from "../helpers/fixtures.js";

describe("mergeSegmentAt", () => {
  it("merges segment i with i+1 into one segment spanning both", () => {
    const cue = makeCueSheet({
      segments: [
        { clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "one" },
        { clip: "a.mp4", in: 5, out: 10, speed: 1, volume: 1, subtitle: "two" },
        { clip: "a.mp4", in: 10, out: 15, speed: 1, volume: 1, subtitle: "three" },
      ],
    });

    const result = mergeSegmentAt(cue, 0);

    expect(result?.segments.length).toBe(2);
    expect(result?.segments[0]).toMatchObject({ in: 0, out: 10, subtitle: "one" });
    expect(result?.segments[1]?.subtitle).toBe("three");
  });

  it("returns null when there is no next segment", () => {
    const cue = makeCueSheet();
    expect(mergeSegmentAt(cue, 0)).toBeNull();
  });

  it("returns null for an out-of-range index", () => {
    const cue = makeCueSheet();
    expect(mergeSegmentAt(cue, 99)).toBeNull();
  });
});
