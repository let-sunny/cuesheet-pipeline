import { describe, expect, it } from "vitest";
import {
  MIN_VIEWPORT_S,
  clampViewportWidth,
  computeDefaultTrimWindow,
  filmstripThumbTimes,
  fitClipViewport,
  moveTrimWindow,
  panViewport,
  resizeViewportEdge,
  zoomViewportAtTime,
  zoomViewportCentered,
} from "../../src/lib/trimWindow.js";

describe("computeDefaultTrimWindow", () => {
  it("on a long take (920s, from the real Dotmix QA clip), keeps the window near the cut instead of the whole clip", () => {
    // A short cut (e.g. 200.0s~203.5s) picked out of a 920s long take - the naive "whole duration"
    // window would give sub-pixel drag handles; the padded-and-floored window should stay small.
    const win = computeDefaultTrimWindow(200, 203.5, 920);
    expect(win.end - win.start).toBeCloseTo(20, 5); // floored to TRIM_WINDOW_MIN_S
    // Centered on the cut's own midpoint (201.75), not on the clip's midpoint.
    const center = (win.start + win.end) / 2;
    expect(center).toBeCloseTo(201.75, 5);
    expect(win.start).toBeGreaterThanOrEqual(0);
    expect(win.end).toBeLessThanOrEqual(920);
  });

  it("on a short clip (13.7s, from the render E2E fixture), the window is just the whole clip", () => {
    const win = computeDefaultTrimWindow(2, 10, 13.7);
    expect(win.start).toBe(0);
    expect(win.end).toBe(13.7);
  });

  it("pads the in/out range by 30% on each side before applying the floor", () => {
    // range=30 -> padding=9 on each side -> raw window [in-9, out+9] = width 48, already >= the
    // 20s floor, so the floor never kicks in here.
    const win = computeDefaultTrimWindow(100, 130, 1000);
    expect(win.start).toBeCloseTo(91, 5);
    expect(win.end).toBeCloseTo(139, 5);
  });

  it("clamps to [0, duration] near the start of the clip, preserving width", () => {
    const win = computeDefaultTrimWindow(1, 3, 100);
    // Unclamped default would start below 0 (in=1, small range -> floored to 20s wide, centered
    // on 2 -> [-8, 12]) - clamped to start at 0, sliding the whole window right to keep its width.
    expect(win.start).toBe(0);
    expect(win.end).toBeCloseTo(20, 5);
  });

  it("clamps to [0, duration] near the end of the clip, preserving width", () => {
    const win = computeDefaultTrimWindow(97, 99, 100);
    expect(win.end).toBe(100);
    expect(win.end - win.start).toBeCloseTo(20, 5);
  });

  it("returns a zero window for a not-yet-loaded clip (duration 0)", () => {
    expect(computeDefaultTrimWindow(0, 5, 0)).toEqual({ start: 0, end: 0 });
  });
});

describe("moveTrimWindow", () => {
  it("re-centers on centerT while preserving the window's width", () => {
    const win = moveTrimWindow({ start: 10, end: 30 }, 1000, 500);
    expect(win.end - win.start).toBe(20);
    expect((win.start + win.end) / 2).toBe(500);
  });

  it("clamps to the clip start without changing width", () => {
    const win = moveTrimWindow({ start: 10, end: 30 }, 1000, 5);
    expect(win.start).toBe(0);
    expect(win.end).toBe(20);
  });

  it("clamps to the clip end without changing width", () => {
    const win = moveTrimWindow({ start: 10, end: 30 }, 100, 95);
    expect(win.end).toBe(100);
    expect(win.start).toBe(80);
  });
});

describe("zoomViewportAtTime (Ctrl/Cmd+wheel, pivots on the cursor's time)", () => {
  it("zooming in (factor > 1) narrows the viewport and keeps the anchor at the same fraction", () => {
    // [0,100], anchor at 25 (25% across) - zooming in 2x should narrow to width 50, still with
    // the anchor at 25% across the new viewport: start = 25 - 0.25*50 = 12.5, end = 62.5.
    const win = zoomViewportAtTime({ start: 0, end: 100 }, 1000, 25, 2);
    expect(win.end - win.start).toBeCloseTo(50, 5);
    expect(win.start).toBeCloseTo(12.5, 5);
    expect(win.end).toBeCloseTo(62.5, 5);
  });

  it("zooming out (factor < 1) widens the viewport, same pivot rule", () => {
    const win = zoomViewportAtTime({ start: 40, end: 60 }, 1000, 50, 0.5);
    expect(win.end - win.start).toBeCloseTo(40, 5);
    expect(win.start).toBeCloseTo(30, 5);
    expect(win.end).toBeCloseTo(70, 5);
  });

  it("never narrows past MIN_VIEWPORT_S", () => {
    const win = zoomViewportAtTime({ start: 0, end: 2 }, 1000, 1, 100);
    expect(win.end - win.start).toBeCloseTo(MIN_VIEWPORT_S, 5);
  });

  it("never widens past the full clip duration", () => {
    const win = zoomViewportAtTime({ start: 10, end: 30 }, 100, 20, 0.001);
    expect(win.end - win.start).toBeCloseTo(100, 5);
    expect(win.start).toBe(0);
    expect(win.end).toBe(100);
  });

  it("clamps into [0, duration] near the start, preserving width", () => {
    const win = zoomViewportAtTime({ start: 0, end: 20 }, 1000, 0, 2);
    expect(win.start).toBe(0);
    expect(win.end - win.start).toBeCloseTo(10, 5);
  });

  it("is a no-op on a zero-width viewport", () => {
    const win = zoomViewportAtTime({ start: 5, end: 5 }, 1000, 5, 2);
    expect(win).toEqual({ start: 5, end: 5 });
  });
});

describe("zoomViewportCentered (+/- buttons, pivots on the playhead)", () => {
  it("zooms in and centers the result exactly on centerT, even off-center", () => {
    // Playhead off-center within [0,100] (nowhere near an edge, so no clamping kicks in) - button
    // zoom still lands the playhead dead center of the new (narrower) viewport.
    const win = zoomViewportCentered({ start: 0, end: 100 }, 1000, 30, 2);
    expect(win.end - win.start).toBeCloseTo(50, 5);
    expect((win.start + win.end) / 2).toBeCloseTo(30, 5);
  });

  it("clamps into bounds near the clip edge while keeping width", () => {
    const win = zoomViewportCentered({ start: 80, end: 100 }, 100, 95, 2);
    expect(win.end - win.start).toBeCloseTo(10, 5);
    expect(win.end).toBe(100);
  });
});

describe("fitClipViewport", () => {
  it("returns [0, duration]", () => {
    expect(fitClipViewport(123.4)).toEqual({ start: 0, end: 123.4 });
  });

  it("floors a negative/zero duration at 0", () => {
    expect(fitClipViewport(0)).toEqual({ start: 0, end: 0 });
  });
});

describe("panViewport", () => {
  it("shifts both bounds by deltaT, preserving width", () => {
    const win = panViewport({ start: 10, end: 30 }, 1000, 50);
    expect(win).toEqual({ start: 60, end: 80 });
  });

  it("clamps at the clip start without changing width", () => {
    const win = panViewport({ start: 10, end: 30 }, 1000, -50);
    expect(win).toEqual({ start: 0, end: 20 });
  });

  it("clamps at the clip end without changing width", () => {
    const win = panViewport({ start: 10, end: 30 }, 100, 1000);
    expect(win).toEqual({ start: 80, end: 100 });
  });
});

describe("resizeViewportEdge (pan control thumb-edge drag)", () => {
  it("dragging the start edge inward narrows from the left, end unchanged", () => {
    const win = resizeViewportEdge({ start: 0, end: 100 }, 1000, "start", 40);
    expect(win).toEqual({ start: 40, end: 100 });
  });

  it("dragging the end edge inward narrows from the right, start unchanged", () => {
    const win = resizeViewportEdge({ start: 0, end: 100 }, 1000, "end", 60);
    expect(win).toEqual({ start: 0, end: 60 });
  });

  it("refuses to narrow the start edge past MIN_VIEWPORT_S from the end", () => {
    const win = resizeViewportEdge({ start: 0, end: 100 }, 1000, "start", 99.9);
    expect(win.end - win.start).toBeCloseTo(MIN_VIEWPORT_S, 5);
  });

  it("refuses to narrow the end edge past MIN_VIEWPORT_S from the start", () => {
    const win = resizeViewportEdge({ start: 0, end: 100 }, 1000, "end", 0.05);
    expect(win.end - win.start).toBeCloseTo(MIN_VIEWPORT_S, 5);
  });

  it("clamps the start edge at 0", () => {
    const win = resizeViewportEdge({ start: 10, end: 100 }, 1000, "start", -50);
    expect(win.start).toBe(0);
  });

  it("clamps the end edge at duration", () => {
    const win = resizeViewportEdge({ start: 0, end: 90 }, 100, "end", 500);
    expect(win.end).toBe(100);
  });
});

describe("clampViewportWidth", () => {
  it("clamps to MIN_VIEWPORT_S..duration", () => {
    expect(clampViewportWidth(0.01, 1000)).toBeCloseTo(MIN_VIEWPORT_S, 5);
    expect(clampViewportWidth(5000, 1000)).toBe(1000);
    expect(clampViewportWidth(50, 1000)).toBe(50);
  });

  it("on a clip shorter than MIN_VIEWPORT_S, the floor becomes the whole clip", () => {
    expect(clampViewportWidth(0.01, 0.5)).toBe(0.5);
  });
});

describe("filmstripThumbTimes", () => {
  it("places one thumb per stride, centered within its cell", () => {
    // 320px wide, 64px stride -> 5 cells over a 100s viewport -> 20s each, centered at 10,30,50,70,90.
    const times = filmstripThumbTimes({ start: 0, end: 100 }, 320, 64);
    expect(times).toEqual([10, 30, 50, 70, 90]);
  });

  it("always renders at least one thumb when there's any width", () => {
    const times = filmstripThumbTimes({ start: 0, end: 100 }, 10, 64);
    expect(times).toHaveLength(1);
    expect(times[0]).toBeCloseTo(50, 5);
  });

  it("is empty for a zero-width viewport or missing pixel width", () => {
    expect(filmstripThumbTimes({ start: 5, end: 5 }, 320, 64)).toEqual([]);
    expect(filmstripThumbTimes({ start: 0, end: 100 }, 0, 64)).toEqual([]);
  });
});
