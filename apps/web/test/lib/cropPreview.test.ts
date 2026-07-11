import { describe, expect, it } from "vitest";
import { cropPreviewStyle } from "../../src/lib/cropPreview.js";

describe("cropPreviewStyle", () => {
  it("returns undefined when there is no crop (null)", () => {
    expect(cropPreviewStyle(null)).toBeUndefined();
  });

  it("returns undefined when there is no crop (undefined)", () => {
    expect(cropPreviewStyle(undefined)).toBeUndefined();
  });

  it("returns a no-op transform for the full-frame crop (x=0,y=0,w=1,h=1)", () => {
    const style = cropPreviewStyle({ x: 0, y: 0, w: 1, h: 1 });
    expect(style).toEqual({ transformOrigin: "0 0", transform: "scale(1, 1) translate(0%, 0%)" });
  });

  it("scales up and translates for a centered half-size crop", () => {
    const style = cropPreviewStyle({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 });
    expect(style).toEqual({
      transformOrigin: "0 0",
      transform: "scale(2, 2) translate(-25%, -25%)",
    });
  });

  it("handles an asymmetric (non-square) crop with independent w/h scale", () => {
    const style = cropPreviewStyle({ x: 0.1, y: 0.2, w: 0.4, h: 0.25 });
    expect(style).toEqual({
      transformOrigin: "0 0",
      transform: `scale(${1 / 0.4}, ${1 / 0.25}) translate(-10%, -20%)`,
    });
  });
});
