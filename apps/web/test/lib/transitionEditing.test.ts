import { describe, expect, it } from "vitest";
import { toggleSegmentTransitionAt, updateSegmentTransitionAt } from "../../src/lib/transitionEditing.js";
import { makeCueSheet } from "../helpers/fixtures.js";

describe("toggleSegmentTransitionAt", () => {
  it("sets a default fade (0.5s) on the 'in' side when turned on, leaving 'out' untouched", () => {
    const cue = makeCueSheet();
    const result = toggleSegmentTransitionAt(cue, 0, "in", true);
    expect(result.segments[0]?.transitionIn).toEqual({ type: "fade", durationS: 0.5 });
    expect(result.segments[0]?.transitionOut).toBeUndefined();
  });

  it("sets a default fade on the 'out' side independently", () => {
    const cue = makeCueSheet();
    const result = toggleSegmentTransitionAt(cue, 0, "out", true);
    expect(result.segments[0]?.transitionOut).toEqual({ type: "fade", durationS: 0.5 });
    expect(result.segments[0]?.transitionIn).toBeUndefined();
  });

  it("removes transitionIn entirely when turned off", () => {
    const cue = makeCueSheet({
      segments: [{ clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "", transitionIn: { type: "fade", durationS: 1 } }],
    });
    const result = toggleSegmentTransitionAt(cue, 0, "in", false);
    expect(result.segments[0]).not.toHaveProperty("transitionIn");
  });

  it("removes transitionOut entirely when turned off", () => {
    const cue = makeCueSheet({
      segments: [{ clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "", transitionOut: { type: "fade", durationS: 1 } }],
    });
    const result = toggleSegmentTransitionAt(cue, 0, "out", false);
    expect(result.segments[0]).not.toHaveProperty("transitionOut");
  });
});

describe("updateSegmentTransitionAt", () => {
  it("patches an existing transitionIn", () => {
    const cue = makeCueSheet({
      segments: [{ clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "", transitionIn: { type: "fade", durationS: 1 } }],
    });
    const result = updateSegmentTransitionAt(cue, 0, "in", { durationS: 2 });
    expect(result.segments[0]?.transitionIn).toEqual({ type: "fade", durationS: 2 });
  });

  it("is a no-op on the 'out' side when the segment has no transitionOut", () => {
    const cue = makeCueSheet();
    const result = updateSegmentTransitionAt(cue, 0, "out", { durationS: 2 });
    expect(result.segments[0]?.transitionOut).toBeUndefined();
  });
});
