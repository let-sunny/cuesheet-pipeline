import { describe, expect, it } from "vitest";
import { computeMergeEligibility, MERGE_ADJACENCY_GAP_S } from "../../src/lib/segmentMerge.js";
import { makeCueSheet } from "../helpers/fixtures.js";

describe("computeMergeEligibility", () => {
  it("is ineligible with no cuesheet at all", () => {
    expect(computeMergeEligibility(null, 0)).toEqual({ eligible: false, reason: "No cuesheet" });
  });

  it("is ineligible when the index points past the end (no current segment)", () => {
    const sheet = makeCueSheet();
    expect(computeMergeEligibility(sheet, 5)).toEqual({ eligible: false, reason: "No cut selected" });
  });

  it("is ineligible when the current segment is the last one", () => {
    const sheet = makeCueSheet();
    expect(computeMergeEligibility(sheet, 0)).toEqual({ eligible: false, reason: "This is the last cut" });
  });

  it("is ineligible when the next segment is a different clip", () => {
    const sheet = makeCueSheet({
      segments: [
        { clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "" },
        { clip: "b.mp4", in: 5, out: 10, speed: 1, volume: 1, subtitle: "" },
      ],
    });
    expect(computeMergeEligibility(sheet, 0)).toEqual({
      eligible: false,
      reason: "Different clips can't be merged",
    });
  });

  it("is ineligible when the gap between out/in is at or above the adjacency threshold", () => {
    const sheet = makeCueSheet({
      segments: [
        { clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "" },
        { clip: "a.mp4", in: 5 + MERGE_ADJACENCY_GAP_S, out: 15, speed: 1, volume: 1, subtitle: "" },
      ],
    });
    const result = computeMergeEligibility(sheet, 0);
    expect(result.eligible).toBe(false);
    expect(result.eligible === false && result.reason).toMatch(/Not adjacent in time/);
  });

  it("is eligible when same clip and the gap is under the adjacency threshold", () => {
    const sheet = makeCueSheet({
      segments: [
        { clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "" },
        { clip: "a.mp4", in: 5.5, out: 10, speed: 1, volume: 1, subtitle: "" },
      ],
    });
    expect(computeMergeEligibility(sheet, 0)).toEqual({ eligible: true });
  });

  it("is eligible on an exact zero gap (back-to-back cuts of the same clip)", () => {
    const sheet = makeCueSheet({
      segments: [
        { clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "" },
        { clip: "a.mp4", in: 5, out: 10, speed: 1, volume: 1, subtitle: "" },
      ],
    });
    expect(computeMergeEligibility(sheet, 0)).toEqual({ eligible: true });
  });

  it("treats a negative gap (overlapping/out-of-order in/out) as adjacent too", () => {
    const sheet = makeCueSheet({
      segments: [
        { clip: "a.mp4", in: 0, out: 8, speed: 1, volume: 1, subtitle: "" },
        { clip: "a.mp4", in: 5, out: 10, speed: 1, volume: 1, subtitle: "" },
      ],
    });
    expect(computeMergeEligibility(sheet, 0)).toEqual({ eligible: true });
  });
});
