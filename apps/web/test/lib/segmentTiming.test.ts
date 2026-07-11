import { describe, expect, it } from "vitest";
import type { Segment } from "@cuesheet/schema";
import { formatClock, playbackSeconds } from "../../src/lib/segmentTiming.js";

function seg(overrides: Partial<Segment> = {}): Segment {
  return { clip: "a.mp4", in: 0, out: 10, speed: 1, volume: 1, subtitle: "", ...overrides };
}

describe("playbackSeconds", () => {
  it("equals out-in at normal (1x) speed", () => {
    expect(playbackSeconds(seg({ in: 2, out: 7, speed: 1 }))).toBe(5);
  });

  it("shrinks proportionally at a faster speed", () => {
    expect(playbackSeconds(seg({ in: 0, out: 10, speed: 4 }))).toBe(2.5);
  });

  it("grows when speed is below 1 (slow motion)", () => {
    expect(playbackSeconds(seg({ in: 0, out: 10, speed: 0.5 }))).toBe(20);
  });
});

describe("formatClock", () => {
  it("formats sub-minute durations as 0:ss", () => {
    expect(formatClock(5)).toBe("0:05");
  });

  it("formats minutes and seconds, zero-padding seconds", () => {
    expect(formatClock(65)).toBe("1:05");
  });

  it("floors (does not round) fractional seconds by default", () => {
    expect(formatClock(59.9)).toBe("0:59");
  });

  it("rounds instead of flooring when roundSeconds is true", () => {
    expect(formatClock(30.4, true)).toBe("0:30");
  });

  // Regression: a rounded-up 60s must carry into the minutes digit rather than showing "0:60"
  // (formatClock reduces to whole seconds first, then splits into m:s).
  it("carries a rounded-up 60s into the minutes digit", () => {
    expect(formatClock(59.9, true)).toBe("1:00");
    expect(formatClock(119.6, true)).toBe("2:00");
  });

  it("treats NaN as 0", () => {
    expect(formatClock(NaN)).toBe("0:00");
  });

  it("treats negative input as 0 (guards against a negative duration)", () => {
    expect(formatClock(-5)).toBe("0:00");
  });

  it("treats zero as 0:00", () => {
    expect(formatClock(0)).toBe("0:00");
  });
});
