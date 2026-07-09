import { describe, expect, it } from "vitest";
import { computeDefaultTrimWindow, moveTrimWindow } from "../../src/lib/trimWindow.js";

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
