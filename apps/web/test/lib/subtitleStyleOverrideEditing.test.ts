import { describe, expect, it } from "vitest";
import {
  changeSegmentStylePresetAt,
  clearSegmentStyleOverrideAt,
  promoteSegmentStyleOverrideAt,
  toggleSegmentStyleOverrideAt,
  updateSegmentStyleOverrideAt,
} from "../../src/lib/subtitleStyleOverrideEditing.js";
import { makeCueSheet } from "../helpers/fixtures.js";

describe("toggleSegmentStyleOverrideAt", () => {
  it("starts the override as a copy of the global subtitleStyle when enabled", () => {
    const cue = makeCueSheet();
    const result = toggleSegmentStyleOverrideAt(cue, 0, true);
    expect(result.segments[0]?.styleOverride).toEqual(cue.subtitleStyle);
  });

  it("removes the styleOverride key entirely when disabled", () => {
    const cue = makeCueSheet({
      segments: [{ clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "", styleOverride: { size: 60 } }],
    });
    const result = toggleSegmentStyleOverrideAt(cue, 0, false);
    expect(result.segments[0]).not.toHaveProperty("styleOverride");
  });
});

describe("updateSegmentStyleOverrideAt", () => {
  it("merges the patch onto an existing override", () => {
    const cue = makeCueSheet({
      segments: [{ clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "", styleOverride: { size: 60 } }],
    });
    const result = updateSegmentStyleOverrideAt(cue, 0, { color: "#ff0000" });
    expect(result.segments[0]?.styleOverride).toEqual({ size: 60, color: "#ff0000" });
  });

  it("starts from an empty override when the segment has none yet", () => {
    const cue = makeCueSheet();
    const result = updateSegmentStyleOverrideAt(cue, 0, { size: 72 });
    expect(result.segments[0]?.styleOverride).toEqual({ size: 72 });
  });
});

describe("clearSegmentStyleOverrideAt", () => {
  it("removes the styleOverride key", () => {
    const cue = makeCueSheet({
      segments: [{ clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "", styleOverride: { size: 60 } }],
    });
    const result = clearSegmentStyleOverrideAt(cue, 0);
    expect(result.segments[0]).not.toHaveProperty("styleOverride");
  });
});

describe("promoteSegmentStyleOverrideAt", () => {
  it("merges the segment's override into the global subtitleStyle and clears the override", () => {
    const cue = makeCueSheet({
      segments: [{ clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "", styleOverride: { size: 96 } }],
    });
    const result = promoteSegmentStyleOverrideAt(cue, 0);
    expect(result?.subtitleStyle.size).toBe(96);
    expect(result?.segments[0]).not.toHaveProperty("styleOverride");
  });

  it("returns null when the segment has no override to promote", () => {
    const cue = makeCueSheet();
    expect(promoteSegmentStyleOverrideAt(cue, 0)).toBeNull();
  });
});

describe("changeSegmentStylePresetAt", () => {
  it("sets the segment's stylePreset", () => {
    const cue = makeCueSheet({ subtitleStylePresets: { bold: { size: 72 } } });
    const result = changeSegmentStylePresetAt(cue, 0, "bold");
    expect(result.segments[0]?.stylePreset).toBe("bold");
  });

  it("clears the preset back to null", () => {
    const cue = makeCueSheet({
      subtitleStylePresets: { bold: { size: 72 } },
      segments: [{ clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "", stylePreset: "bold" }],
    });
    const result = changeSegmentStylePresetAt(cue, 0, null);
    expect(result.segments[0]?.stylePreset).toBeNull();
  });
});
