import { describe, expect, it } from "vitest";
import { computeLockRatio, fitCrossAxis, maxCropForRatio, resizeLocked } from "../../src/lib/cropGeometry.js";
import type { Crop } from "@cuesheet/schema";

describe("computeLockRatio", () => {
  it("falls back to 1 (square-lock) before natural size is known", () => {
    expect(computeLockRatio(1920, 1080, null)).toBe(1);
  });

  it("is 1 when the source and project share the same aspect ratio", () => {
    expect(computeLockRatio(1920, 1080, { width: 1920, height: 1080 })).toBe(1);
    expect(computeLockRatio(1080, 1920, { width: 1080, height: 1920 })).toBe(1);
  });

  it("reflects the source/project aspect mismatch (e.g. a 16:9 source cropped to a 9:16 project)", () => {
    // source 1920x1080 (16:9), project 1080x1920 (9:16, portrait) -> ratio should be (9/16)/(16/9) = 81/256
    const ratio = computeLockRatio(1080, 1920, { width: 1920, height: 1080 });
    expect(ratio).toBeCloseTo(81 / 256, 6);
  });
});

describe("maxCropForRatio", () => {
  it("is the full frame for ratio 1", () => {
    expect(maxCropForRatio(1)).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  it("is centered and width-limited for a wide (>1) ratio", () => {
    const crop = maxCropForRatio(2);
    expect(crop.w).toBe(1);
    expect(crop.h).toBeCloseTo(0.5, 6);
    expect(crop.x).toBe(0);
    expect(crop.y).toBeCloseTo(0.25, 6);
  });

  it("is centered and height-limited for a narrow (<1) ratio", () => {
    const crop = maxCropForRatio(0.5);
    expect(crop.h).toBe(1);
    expect(crop.w).toBeCloseTo(0.5, 6);
    expect(crop.y).toBe(0);
    expect(crop.x).toBeCloseTo(0.25, 6);
  });
});

describe("fitCrossAxis", () => {
  it("keeps the current center when it fits", () => {
    expect(fitCrossAxis(0.2, 0.4, 0.2)).toBeCloseTo(0.4, 6); // center 0.5, size 0.2 -> pos 0.4
  });

  it("pushes inward instead of shrinking when centering would overflow the frame", () => {
    expect(fitCrossAxis(0.5, 0.9, 0.1)).toBe(0.5); // center 0.95, size 0.5 would go to 1.2 -> clamp to 1-0.5
    expect(fitCrossAxis(0.5, -0.4, 0.1)).toBe(0); // center -0.35, size 0.5 would go negative -> clamp to 0
  });
});

describe("resizeLocked", () => {
  const square: Crop = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };

  it("se: grows/shrinks the box from its top-left anchor, keeping ratio 1 (square)", () => {
    const grown = resizeLocked(square, "se", 0.1, 0.1, 1);
    expect(grown.x).toBeCloseTo(0.25, 6);
    expect(grown.y).toBeCloseTo(0.25, 6);
    expect(grown.w).toBeCloseTo(0.6, 6);
    expect(grown.h).toBeCloseTo(0.6, 6);
  });

  it("nw: grows toward the top-left, anchoring the bottom-right corner", () => {
    const grown = resizeLocked(square, "nw", -0.1, -0.1, 1);
    expect(grown.w).toBeCloseTo(0.6, 6);
    expect(grown.h).toBeCloseTo(0.6, 6);
    // bottom-right corner (x+w, y+h) stays at (0.75, 0.75)
    expect(grown.x + grown.w).toBeCloseTo(0.75, 6);
    expect(grown.y + grown.h).toBeCloseTo(0.75, 6);
  });

  it("e: grows width only along x, keeping the vertical center fixed", () => {
    const grown = resizeLocked(square, "e", 0.2, 0, 1);
    expect(grown.w).toBeCloseTo(0.7, 6);
    expect(grown.h).toBeCloseTo(0.7, 6);
    expect(grown.x).toBeCloseTo(0.25, 6);
    // vertical center (0.5) preserved
    expect(grown.y + grown.h / 2).toBeCloseTo(0.5, 6);
  });

  it("never shrinks below MIN_SIZE (0.11) regardless of how far the handle is dragged", () => {
    const shrunk = resizeLocked(square, "se", -10, -10, 1);
    expect(shrunk.w).toBeCloseTo(0.11, 6);
    expect(shrunk.h).toBeCloseTo(0.11, 6);
  });

  it("never grows past the frame boundary (se bounded by 1-x)", () => {
    const grown = resizeLocked(square, "se", 10, 10, 1);
    expect(grown.w).toBeCloseTo(0.75, 6); // 1 - x(0.25)
    expect(grown.h).toBeCloseTo(0.75, 6);
  });

  it("holds w/h === ratio for a non-square lock ratio (e.g. 16:9 -> 9:16 crop, ratio<1)", () => {
    const start: Crop = { x: 0.1, y: 0.1, w: 0.3, h: 0.6 }; // already w/h = 0.5
    const grown = resizeLocked(start, "s", 0, 0.1, 0.5);
    expect(grown.w / grown.h).toBeCloseTo(0.5, 6);
  });
});
