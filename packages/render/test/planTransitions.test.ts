import { describe, expect, it } from "vitest";
import { applyTransition, clampTransitionDurations, transitionAudioFilters } from "../src/planTransitions.js";

describe("clampTransitionDurations", () => {
  it("clamps each side individually to outputDurationS when they don't overlap", () => {
    const { dIn, dOut } = clampTransitionDurations(
      { type: "fade", durationS: 10 },
      { type: "fade", durationS: 10 },
      100,
    );
    expect(dIn).toBe(10);
    expect(dOut).toBe(10);
  });

  it("scales both sides down proportionally when their sum would exceed outputDurationS", () => {
    // 2s in + 2s out on a 1.5s cut - sum (4) > outputDurationS (1.5), so scale = 1.5/4 = 0.375.
    const { dIn, dOut } = clampTransitionDurations(
      { type: "fade", durationS: 2 },
      { type: "fade", durationS: 2 },
      1.5,
    );
    expect(dIn).toBeCloseTo(0.75);
    expect(dOut).toBeCloseTo(0.75);
    expect(dIn + dOut).toBeLessThanOrEqual(1.5);
  });

  it("floors each side at 0.1s even under extreme scaling", () => {
    const { dIn, dOut } = clampTransitionDurations(
      { type: "fade", durationS: 100 },
      { type: "fade", durationS: 100 },
      0.01,
    );
    expect(dIn).toBeGreaterThanOrEqual(0.1);
    expect(dOut).toBeGreaterThanOrEqual(0.1);
  });

  it("returns 0 for a side with no transition", () => {
    const { dIn, dOut } = clampTransitionDurations(undefined, undefined, 10);
    expect(dIn).toBe(0);
    expect(dOut).toBe(0);
  });
});

describe("applyTransition", () => {
  it("appends a plain fade filter for type 'fade' on the in side", () => {
    const filters: string[] = [];
    const label = applyTransition(filters, "v0", 0, "in", { type: "fade", durationS: 1 }, 1, 5, 1920, 1080, 30);

    expect(label).toBe("vtxin0");
    expect(filters).toEqual(["[v0]fade=t=in:st=0:d=1[vtxin0]"]);
  });

  it("appends a fade filter starting at outputDurationS-d for the out side", () => {
    const filters: string[] = [];
    const label = applyTransition(filters, "v0", 0, "out", { type: "fade", durationS: 1 }, 1, 5, 1920, 1080, 30);

    expect(label).toBe("vtxout0");
    expect(filters).toEqual(["[v0]fade=t=out:st=4:d=1[vtxout0]"]);
  });

  it("builds a color+overlay dip chain for type 'dip'", () => {
    const filters: string[] = [];
    const label = applyTransition(filters, "v0", 0, "in", { type: "dip", durationS: 1, dim: 0.5 }, 1, 5, 1920, 1080, 30);

    expect(label).toBe("vdipin0");
    expect(filters).toHaveLength(2);
    expect(filters[0]).toContain("color=black:size=1920x1080:duration=5:rate=30");
    expect(filters[0]).toContain("colorchannelmixer=aa=0.5[dipin0]");
    expect(filters[1]).toBe("[v0][dipin0]overlay=0:0[vdipin0]");
  });

  it("defaults dip's dim to 1 when not specified", () => {
    const filters: string[] = [];
    applyTransition(filters, "v0", 0, "out", { type: "dip", durationS: 1 }, 1, 5, 1920, 1080, 30);

    expect(filters[0]).toContain("colorchannelmixer=aa=1[dipout0]");
  });
});

describe("transitionAudioFilters", () => {
  it("returns an afade-in fragment for transitionIn only", () => {
    expect(transitionAudioFilters({ type: "fade", durationS: 1 }, undefined, 1, 0, 5)).toEqual([
      "afade=t=in:st=0:d=1",
    ]);
  });

  it("returns an afade-out fragment for transitionOut only, offset by outputDurationS-dOut", () => {
    expect(transitionAudioFilters(undefined, { type: "fade", durationS: 1 }, 0, 1, 5)).toEqual([
      "afade=t=out:st=4:d=1",
    ]);
  });

  it("returns both fragments when both sides are present", () => {
    expect(transitionAudioFilters({ type: "fade", durationS: 1 }, { type: "fade", durationS: 1 }, 1, 1, 5)).toEqual([
      "afade=t=in:st=0:d=1",
      "afade=t=out:st=4:d=1",
    ]);
  });

  it("returns an empty array when neither side is present", () => {
    expect(transitionAudioFilters(undefined, undefined, 0, 0, 5)).toEqual([]);
  });
});
