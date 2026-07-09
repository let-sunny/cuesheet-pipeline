import { describe, expect, it } from "vitest";
import { validateCueSheet } from "@cuesheet/schema";
import type { CueSheet } from "@cuesheet/schema";
import { buildDuckingGainExpression, deriveDuckingWindows, mergeDuckingWindows } from "../src/ducking.js";

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

describe("mergeDuckingWindows", () => {
  it("returns an empty array for no windows", () => {
    expect(mergeDuckingWindows([])).toEqual([]);
  });

  it("keeps disjoint windows separate", () => {
    expect(mergeDuckingWindows([{ start: 0, end: 1 }, { start: 5, end: 6 }])).toEqual([
      { start: 0, end: 1 },
      { start: 5, end: 6 },
    ]);
  });

  it("merges overlapping windows", () => {
    expect(mergeDuckingWindows([{ start: 0, end: 3 }, { start: 2, end: 5 }])).toEqual([
      { start: 0, end: 5 },
    ]);
  });

  it("merges touching windows (end === next start)", () => {
    expect(mergeDuckingWindows([{ start: 0, end: 3 }, { start: 3, end: 5 }])).toEqual([
      { start: 0, end: 5 },
    ]);
  });

  it("merges regardless of input order", () => {
    expect(mergeDuckingWindows([{ start: 5, end: 6 }, { start: 0, end: 1 }])).toEqual([
      { start: 0, end: 1 },
      { start: 5, end: 6 },
    ]);
  });

  it("collapses a fully-nested window into its container", () => {
    expect(mergeDuckingWindows([{ start: 0, end: 10 }, { start: 2, end: 4 }])).toEqual([
      { start: 0, end: 10 },
    ]);
  });
});

describe("deriveDuckingWindows", () => {
  it("returns no windows when narration is off, even with narration files present", () => {
    const cue = make({
      narration: { enabled: false, dir: "/narration", volume: 1 },
      segments: [{ clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "", narration: "n0.mp3" }],
    });
    const { windows, warnings } = deriveDuckingWindows(cue, { 0: 3 });
    expect(windows).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("places a window at the segment's output start, extended by the narration's duration", () => {
    const cue = make({
      narration: { enabled: true, dir: "/narration", volume: 1 },
      segments: [
        { clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "" },
        { clip: "b.mp4", in: 0, out: 4, speed: 1, volume: 1, subtitle: "", narration: "n1.mp3" },
      ],
    });
    const { windows, warnings } = deriveDuckingWindows(cue, { 1: 2.5 });
    // Segment a's output duration is 5s (in=0,out=5,speed=1), so b starts at t=5.
    expect(windows).toEqual([{ start: 5, end: 7.5 }]);
    expect(warnings).toEqual([]);
  });

  it("accounts for segment speed when computing cumulative output offsets", () => {
    const cue = make({
      narration: { enabled: true, dir: "/narration", volume: 1 },
      segments: [
        // (out-in)/speed = (6-2)/2 = 2s
        { clip: "a.mp4", in: 2, out: 6, speed: 2, volume: 1, subtitle: "" },
        { clip: "b.mp4", in: 0, out: 1, speed: 1, volume: 1, subtitle: "", narration: "n1.mp3" },
      ],
    });
    const { windows } = deriveDuckingWindows(cue, { 1: 1 });
    expect(windows).toEqual([{ start: 2, end: 3 }]);
  });

  it("skips a narrated segment with no probed duration and reports a warning instead of throwing", () => {
    const cue = make({
      narration: { enabled: true, dir: "/narration", volume: 1 },
      segments: [{ clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "", narration: "n0.mp3" }],
    });
    const { windows, warnings } = deriveDuckingWindows(cue, undefined);
    expect(windows).toEqual([]);
    expect(warnings).toEqual([
      "segments[0].narration: could not determine this narration clip's duration - ducking skipped for this cut",
    ]);
  });

  it("merges windows from back-to-back narrated segments", () => {
    const cue = make({
      narration: { enabled: true, dir: "/narration", volume: 1 },
      segments: [
        { clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "", narration: "n0.mp3" },
        { clip: "b.mp4", in: 0, out: 4, speed: 1, volume: 1, subtitle: "", narration: "n1.mp3" },
      ],
    });
    // a: window [0, 5.2] (overlaps into b's [5, 9) start at t=5)
    const { windows } = deriveDuckingWindows(cue, { 0: 5.2, 1: 1 });
    expect(windows).toEqual([{ start: 0, end: 6 }]);
  });
});

describe("buildDuckingGainExpression", () => {
  it("returns null for no windows", () => {
    expect(buildDuckingGainExpression([], 0.6, 0.3)).toBeNull();
  });

  it("returns null when amount is 0 (no-op duck)", () => {
    expect(buildDuckingGainExpression([{ start: 0, end: 5 }], 0, 0.3)).toBeNull();
  });

  it("shapes a single window as ramp-down / floor / ramp-up, gated by between()", () => {
    const expr = buildDuckingGainExpression([{ start: 2, end: 8 }], 0.6, 0.5);
    expect(expr).not.toBeNull();
    expect(expr).toContain("between(t,2,8)");
    // Ramp-in: 1 - amount*(t-start)/fade
    expect(expr).toContain("1-(0.6)*(t-2)/0.5");
    // Sustain floor at 1-amount = 0.4, active from start+fade to end-fade
    expect(expr).toContain("lt(t,2.5),(1-(0.6)*(t-2)/0.5),if(lt(t,7.5),0.4");
    // Ramp-out: floor + amount*(t-(end-fade))/fade
    expect(expr).toContain("0.4+(0.6)*(t-(7.5))/0.5");
    // Falls back to 1 outside every window.
    expect(expr?.endsWith(",1)")).toBe(true);
  });

  it("clamps the fade to half the window's length for a very short window", () => {
    // Window length 0.4 < 2*fadeS(0.3) -> f clamped to 0.2, meeting exactly at the midpoint.
    const expr = buildDuckingGainExpression([{ start: 0, end: 0.4 }], 0.6, 0.3);
    expect(expr).toContain("lt(t,0.2)");
    expect(expr).toContain("lt(t,0.2),0.4");
  });

  it("chains multiple non-overlapping windows, each gated by its own between()", () => {
    const expr = buildDuckingGainExpression(
      [
        { start: 0, end: 2 },
        { start: 10, end: 12 },
      ],
      0.5,
      0.2,
    );
    expect(expr?.match(/between\(t,/g)?.length).toBe(2);
    expect(expr).toContain("between(t,0,2)");
    expect(expr).toContain("between(t,10,12)");
  });
});
