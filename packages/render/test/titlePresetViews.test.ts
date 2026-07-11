import { describe, expect, it } from "vitest";
import { computeFadeTitleFrame } from "../src/remotion/FadeTitleView.js";
import { computeHighlightFrame } from "../src/remotion/HighlightTitleView.js";
import { computeTypewriterFrame } from "../src/remotion/TypewriterTitleView.js";
import { computeWordStaggerFrame } from "../src/remotion/WordStaggerTitleView.js";

/**
 * Covers the pure per-frame math each preset's browser-safe View renders from (see
 * FadeTitleView.tsx's doc comment for why this is split out - the same functions run inside the
 * real Remotion render and inside apps/web's plain rAF-driven preview). Deterministic - no
 * browser/Remotion composition context needed, so this is the fast, reliable way to prove the
 * animation actually advances over frames rather than sitting frozen at frame 0 (the failure mode
 * @remotion/player kept hitting in this environment).
 */
const FPS = 30;
const DURATION_IN_FRAMES = 90;

describe("computeFadeTitleFrame", () => {
  it("starts near-invisible/shrunk at frame 0 and reaches full opacity/scale partway through", () => {
    const start = computeFadeTitleFrame(0, FPS, DURATION_IN_FRAMES);
    const mid = computeFadeTitleFrame(Math.round(DURATION_IN_FRAMES * 0.5), FPS, DURATION_IN_FRAMES);

    expect(start.opacity).toBeLessThan(0.1);
    expect(start.scale).toBeLessThan(0.98);
    expect(mid.opacity).toBeGreaterThan(0.9);
    expect(mid.scale).toBeGreaterThan(0.99);
  });

  it("fades back out over the last EXIT_FRAMES before durationInFrames", () => {
    const end = computeFadeTitleFrame(DURATION_IN_FRAMES, FPS, DURATION_IN_FRAMES);
    expect(end.opacity).toBe(0);
  });
});

describe("computeTypewriterFrame", () => {
  it("shows 0 characters at frame 0 and more characters at a later frame", () => {
    const start = computeTypewriterFrame(0, "Cast on today");
    const later = computeTypewriterFrame(20, "Cast on today");

    expect(start.shown).toBe("");
    expect(later.shown.length).toBeGreaterThan(start.shown.length);
  });

  it("reports the cursor as no longer visible once every character has been shown", () => {
    const text = "hi";
    const done = computeTypewriterFrame(1000, text);
    expect(done.shown).toBe(text);
    expect(done.cursorVisible).toBe(false);
  });
});

describe("computeWordStaggerFrame", () => {
  it("climbs each word's opacity from frame 0 toward 1 over time, later words trailing earlier ones", () => {
    const text = "cast on today";
    const start = computeWordStaggerFrame(0, FPS, text);
    const later = computeWordStaggerFrame(20, FPS, text);

    for (const w of start) {
      expect(w.opacity).toBeLessThan(0.1);
    }
    expect(later[0]!.opacity).toBeGreaterThan(start[0]!.opacity);
    // The staggered (later) word has had less time under its delayed spring, so at the same frame
    // its opacity trails the first word's.
    expect(later[2]!.opacity).toBeLessThanOrEqual(later[0]!.opacity);
  });
});

describe("computeHighlightFrame", () => {
  it("climbs the marker's scaleX from near 0 at frame 0 toward 1 over time", () => {
    const text = "cast on today";
    const start = computeHighlightFrame(0, FPS, text);
    const later = computeHighlightFrame(20, FPS, text);

    expect(start.markerScaleX).toBeLessThan(0.1);
    expect(later.markerScaleX).toBeGreaterThan(start.markerScaleX);
    expect(start.keyword).toBe("today");
    expect(start.lead).toBe("cast on");
  });
});
