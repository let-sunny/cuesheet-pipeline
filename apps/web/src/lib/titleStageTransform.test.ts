import { describe, expect, it } from "vitest";
import { computeTitleStageTransform } from "./titleStageTransform.js";

describe("computeTitleStageTransform", () => {
  it("scales down to fit a smaller box, matching the box's aspect ratio", () => {
    const { scale, offsetX, offsetY } = computeTitleStageTransform(960, 540, 1920, 1080);
    expect(scale).toBeCloseTo(0.5);
    expect(offsetX).toBeCloseTo(0);
    expect(offsetY).toBeCloseTo(0);
  });

  it("uses the smaller ratio and centers when the box's aspect ratio doesn't match the project's", () => {
    // Box is wider relative to its height than the project (16:9) - height is the limiting
    // dimension, so the canvas is centered horizontally (letterboxed on the sides).
    const { scale, offsetX, offsetY } = computeTitleStageTransform(1000, 500, 1920, 1080);
    expect(scale).toBeCloseTo(500 / 1080);
    expect(offsetX).toBeGreaterThan(0);
    expect(offsetY).toBeCloseTo(0);
  });

  it("falls back to scale 1 / no offset when the box hasn't been measured yet", () => {
    expect(computeTitleStageTransform(0, 0, 1920, 1080)).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
  });
});
