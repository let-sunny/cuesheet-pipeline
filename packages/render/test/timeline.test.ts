import { describe, expect, it } from "vitest";
import { validateCueSheet } from "@cuesheet/schema";
import type { CueSheet } from "@cuesheet/schema";
import { computeSegmentOutputTimings } from "../src/timeline.js";

function make(overrides: Record<string, unknown> = {}): CueSheet {
  const base = {
    project: { name: "t", fps: 30, width: 1920, height: 1080 },
    clipDir: "/clips",
    intro: null,
    outro: null,
    segments: [{ clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "" }],
    bgm: [],
    subtitleStyle: {
      font: "Pretendard",
      size: 48,
      color: "#ffffff",
      outlineColor: "#000000",
      outlineWidth: 3,
      position: "bottom",
    },
  };
  const r = validateCueSheet({ ...base, ...overrides });
  if (!r.ok) throw new Error(r.errors.join("\n"));
  return r.data;
}

describe("computeSegmentOutputTimings", () => {
  it("returns an empty array for no segments", () => {
    // Schema requires >=1 segment (validateCueSheet would reject this) - constructed directly
    // since this test only exercises the pure accumulation logic, not cuesheet validity.
    const cue = { ...make(), segments: [] } as CueSheet;
    expect(computeSegmentOutputTimings(cue)).toEqual([]);
  });

  it("starts the first segment at 0 and accumulates each segment's (out-in)/speed", () => {
    const cue = make({
      segments: [
        { clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "" },
        { clip: "b.mp4", in: 2, out: 6, speed: 1, volume: 1, subtitle: "" },
        { clip: "c.mp4", in: 0, out: 3, speed: 1, volume: 1, subtitle: "" },
      ],
    });
    const timings = computeSegmentOutputTimings(cue);
    expect(timings).toEqual([
      { index: 0, startS: 0, durationS: 5 },
      { index: 1, startS: 5, durationS: 4 },
      { index: 2, startS: 9, durationS: 3 },
    ]);
  });

  it("divides by speed to get the OUTPUT (post-speed) duration, not the raw (out-in)", () => {
    const cue = make({
      segments: [
        { clip: "a.mp4", in: 0, out: 10, speed: 2, volume: 1, subtitle: "" }, // 10s raw -> 5s output
        { clip: "b.mp4", in: 0, out: 4, speed: 0.5, volume: 1, subtitle: "" }, // 4s raw -> 8s output
      ],
    });
    const timings = computeSegmentOutputTimings(cue);
    expect(timings).toEqual([
      { index: 0, startS: 0, durationS: 5 },
      { index: 1, startS: 5, durationS: 8 },
    ]);
  });

  it("does not include intro's duration in segment 0's startS (v1 constraint: intro duration isn't probed)", () => {
    const cue = make({
      intro: "/i.mp4",
      segments: [{ clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "" }],
    });
    const timings = computeSegmentOutputTimings(cue);
    expect(timings[0]?.startS).toBe(0);
  });
});
