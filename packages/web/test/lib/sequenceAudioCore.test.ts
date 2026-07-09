import { describe, expect, it } from "vitest";
import type { BgmCue, CueSheet, Segment } from "@cuesheet/schema";
import {
  buildNarrationDurations,
  computeAudioStates,
  duckingGainAt,
} from "../../src/lib/sequenceAudioCore.js";

function seg(overrides: Partial<Segment> = {}): Segment {
  return { clip: "a.mp4", in: 0, out: 10, speed: 1, volume: 1, subtitle: "", ...overrides };
}

function bgmCue(overrides: Partial<BgmCue> = {}): BgmCue {
  return { file: "media/bgm/track1.mp3", start: 0, end: 10, volume: 0.8, ...overrides };
}

function baseCue(overrides: Partial<CueSheet> = {}): CueSheet {
  return {
    project: { name: "p", fps: 30, width: 1920, height: 1080 },
    clipDir: "media/clips",
    intro: null,
    outro: null,
    segments: [seg()],
    bgm: [],
    subtitleStyle: {
      font: "sans-serif",
      size: 40,
      color: "#fff",
      outlineColor: "#000",
      outlineWidth: 2,
      position: "bottom",
      margin: 24,
    },
    ...overrides,
  };
}

describe("duckingGainAt", () => {
  it("returns 1 outside every window", () => {
    expect(duckingGainAt([{ start: 5, end: 10 }], 0.6, 0.3, 0)).toBe(1);
    expect(duckingGainAt([{ start: 5, end: 10 }], 0.6, 0.3, 20)).toBe(1);
  });

  it("returns 1 with no windows or a zero/negative amount", () => {
    expect(duckingGainAt([], 0.6, 0.3, 5)).toBe(1);
    expect(duckingGainAt([{ start: 0, end: 10 }], 0, 0.3, 5)).toBe(1);
  });

  it("holds at the floor (1-amount) through the middle of a window", () => {
    expect(duckingGainAt([{ start: 0, end: 10 }], 0.6, 0.3, 5)).toBeCloseTo(0.4, 6);
  });

  it("ramps down linearly entering a window", () => {
    // Halfway through the fade-in (fadeS=0.3, t=0.15) -> halfway between 1 and floor(0.4).
    expect(duckingGainAt([{ start: 0, end: 10 }], 0.6, 0.3, 0.15)).toBeCloseTo(0.7, 6);
    expect(duckingGainAt([{ start: 0, end: 10 }], 0.6, 0.3, 0)).toBeCloseTo(1, 6);
  });

  it("ramps back up linearly leaving a window", () => {
    // fadeS=0.3, window end=10 -> ramp-out starts at t=9.7.
    expect(duckingGainAt([{ start: 0, end: 10 }], 0.6, 0.3, 9.7)).toBeCloseTo(0.4, 6);
    expect(duckingGainAt([{ start: 0, end: 10 }], 0.6, 0.3, 9.85)).toBeCloseTo(0.7, 6);
    expect(duckingGainAt([{ start: 0, end: 10 }], 0.6, 0.3, 10)).toBeCloseTo(1, 6);
  });

  it("clamps fadeS to half a short window's length instead of overshooting", () => {
    // window length 1, fadeS 0.3 requested but clamped to 1 -> f = min(0.3, 0.5) = 0.3, still fine;
    // use a shorter window (0.2s) to force the clamp: f = min(0.3, 0.1) = 0.1.
    const windows = [{ start: 0, end: 0.2 }];
    expect(duckingGainAt(windows, 0.6, 0.3, 0.1)).toBeCloseTo(0.4, 6); // exact middle, at the floor
  });
});

describe("buildNarrationDurations", () => {
  it("maps segment index -> duration by matching narration filename", () => {
    const segments = [seg({ narration: "line1.wav" }), seg({ narration: null }), seg({ narration: "line3.wav" })];
    const files = [
      { name: "line1.wav", durationS: 3.5 },
      { name: "line3.wav", durationS: 2 },
    ];
    expect(buildNarrationDurations(segments, files)).toEqual({ 0: 3.5, 2: 2 });
  });

  it("omits a segment whose narration file isn't found in the listing", () => {
    const segments = [seg({ narration: "missing.wav" })];
    expect(buildNarrationDurations(segments, [{ name: "other.wav", durationS: 1 }])).toEqual({});
  });

  it("omits a segment whose matched file has a null (unprobed) duration", () => {
    const segments = [seg({ narration: "line1.wav" })];
    expect(buildNarrationDurations(segments, [{ name: "line1.wav", durationS: null }])).toEqual({});
  });
});

describe("computeAudioStates - bgm", () => {
  it("shouldPlay is true only within [start, end) and false outside", () => {
    const cue = baseCue({ bgm: [bgmCue({ start: 5, end: 15 })] });
    expect(computeAudioStates(cue, 4.999, undefined).bgm[0]?.shouldPlay).toBe(false);
    expect(computeAudioStates(cue, 5, undefined).bgm[0]?.shouldPlay).toBe(true);
    expect(computeAudioStates(cue, 14.999, undefined).bgm[0]?.shouldPlay).toBe(true);
    expect(computeAudioStates(cue, 15, undefined).bgm[0]?.shouldPlay).toBe(false); // end is exclusive
  });

  it("seekS is position minus the track's own start", () => {
    const cue = baseCue({ bgm: [bgmCue({ start: 5, end: 15 })] });
    expect(computeAudioStates(cue, 8, undefined).bgm[0]?.seekS).toBeCloseTo(3, 6);
  });

  it("a track with an empty file never shouldPlay", () => {
    const cue = baseCue({ bgm: [bgmCue({ file: "", start: 0, end: 100 })] });
    expect(computeAudioStates(cue, 50, undefined).bgm[0]?.shouldPlay).toBe(false);
  });

  it("volume equals track.volume when ducking is off", () => {
    const cue = baseCue({ bgm: [bgmCue({ volume: 0.5, start: 0, end: 100 })] });
    expect(computeAudioStates(cue, 10, undefined).bgm[0]?.volume).toBeCloseTo(0.5, 6);
  });

  it("multiple overlapping tracks each get their own independent state", () => {
    const cue = baseCue({
      bgm: [bgmCue({ file: "a.mp3", start: 0, end: 10 }), bgmCue({ file: "b.mp3", start: 5, end: 20 })],
    });
    const states = computeAudioStates(cue, 7, undefined).bgm;
    expect(states).toHaveLength(2);
    expect(states[0]).toMatchObject({ bgmIndex: 0, shouldPlay: true, seekS: 7 });
    expect(states[1]).toMatchObject({ bgmIndex: 1, shouldPlay: true, seekS: 2 });
  });
});

describe("computeAudioStates - ducking multiply", () => {
  function cueWithDucking(): CueSheet {
    return baseCue({
      segments: [seg({ in: 0, out: 10, narration: "line1.wav" }), seg({ in: 0, out: 10, narration: null })],
      bgm: [bgmCue({ volume: 0.8, start: 0, end: 20 })],
      narration: { enabled: true, dir: "media/narration", volume: 1, ducking: { amount: 0.6, fadeS: 0.3 } },
    });
  }

  it("multiplies bgm volume by the ducking floor while inside a narration window", () => {
    const cue = cueWithDucking();
    // segment 0 output-starts at 0, narration duration 5s (well inside its fade-clamped middle).
    const states = computeAudioStates(cue, 2, { 0: 5 });
    expect(states.bgm[0]?.volume).toBeCloseTo(0.8 * 0.4, 6);
  });

  it("bgm volume is unducked (full) once past the narration window", () => {
    const cue = cueWithDucking();
    const states = computeAudioStates(cue, 8, { 0: 5 });
    expect(states.bgm[0]?.volume).toBeCloseTo(0.8, 6);
  });

  it("does not duck when narration.ducking is absent even if narration is enabled", () => {
    const cue = cueWithDucking();
    cue.narration = { enabled: true, dir: "media/narration", volume: 1 };
    const states = computeAudioStates(cue, 2, { 0: 5 });
    expect(states.bgm[0]?.volume).toBeCloseTo(0.8, 6);
  });
});

describe("computeAudioStates - narration", () => {
  it("is empty when narration is disabled/absent", () => {
    const cue = baseCue({ segments: [seg({ narration: "line1.wav" })] });
    expect(computeAudioStates(cue, 1, undefined).narration).toEqual([]);
  });

  it("shouldPlay true within [segmentStart, segmentStart+duration) using a known duration", () => {
    const cue = baseCue({
      segments: [seg({ in: 0, out: 20, narration: "line1.wav" })],
      narration: { enabled: true, dir: "media/narration", volume: 1 },
    });
    const withDur = { 0: 4 };
    expect(computeAudioStates(cue, 0, withDur).narration[0]?.shouldPlay).toBe(true);
    expect(computeAudioStates(cue, 3.999, withDur).narration[0]?.shouldPlay).toBe(true);
    expect(computeAudioStates(cue, 4, withDur).narration[0]?.shouldPlay).toBe(false);
  });

  it("falls back to the segment's own on-screen duration when the real duration is unknown", () => {
    const cue = baseCue({
      segments: [seg({ in: 0, out: 6, speed: 2, narration: "line1.wav" })], // playback duration = 3s
      narration: { enabled: true, dir: "media/narration", volume: 1 },
    });
    expect(computeAudioStates(cue, 2.999, undefined).narration[0]?.shouldPlay).toBe(true);
    expect(computeAudioStates(cue, 3, undefined).narration[0]?.shouldPlay).toBe(false);
  });

  it("uses the second segment's cumulative output start for its seekS/window, not the first's", () => {
    const cue = baseCue({
      segments: [seg({ in: 0, out: 10, narration: null }), seg({ in: 0, out: 10, narration: "line2.wav" })],
      narration: { enabled: true, dir: "media/narration", volume: 1 },
    });
    const states = computeAudioStates(cue, 13, { 1: 5 }).narration;
    expect(states).toHaveLength(1);
    expect(states[0]).toMatchObject({ segmentIndex: 1, shouldPlay: true, seekS: 3 });
  });

  it("uses narration.volume for every narrated segment", () => {
    const cue = baseCue({
      segments: [seg({ narration: "line1.wav" })],
      narration: { enabled: true, dir: "media/narration", volume: 0.7 },
    });
    expect(computeAudioStates(cue, 0, undefined).narration[0]?.volume).toBeCloseTo(0.7, 6);
  });
});
