import { describe, expect, it } from "vitest";
import type { ClipMoments } from "../src/api.js";
import { computeClipDurations } from "../src/clipPaths.js";

describe("computeClipDurations", () => {
  it("keys the result by the full clip path (not just its basename) - matches segment.clip lookups", () => {
    const entries: ClipMoments[] = [
      {
        clip: "001_label_260609/VID_20260609_224617_001.mp4",
        clipSummary: "",
        moments: [{ inS: 0, outS: 5, shotType: "other", memo: "", quality: 3 }],
        monotonousRanges: [],
      },
    ];
    const durations = computeClipDurations(entries);
    expect(durations["001_label_260609/VID_20260609_224617_001.mp4"]).toBe(5);
    expect(durations["VID_20260609_224617_001.mp4"]).toBeUndefined();
  });

  it("takes the max of moments outS and monotonousRanges endS as the approximate duration", () => {
    const entries: ClipMoments[] = [
      {
        clip: "a.mp4",
        clipSummary: "",
        moments: [{ inS: 0, outS: 5, shotType: "other", memo: "", quality: 3 }],
        monotonousRanges: [{ startS: 10, endS: 20, desc: "" }],
      },
    ];
    expect(computeClipDurations(entries)["a.mp4"]).toBe(20);
  });
});
