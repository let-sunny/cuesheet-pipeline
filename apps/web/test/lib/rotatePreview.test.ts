import { describe, expect, it } from "vitest";
import { nextRotate, rotatePreviewStyle } from "../../src/lib/rotatePreview.js";

describe("rotatePreviewStyle", () => {
  it("returns no style when rotate is null/undefined", () => {
    expect(rotatePreviewStyle(null, 1920, 1080)).toEqual({ frame: undefined, video: undefined });
    expect(rotatePreviewStyle(undefined, 1920, 1080)).toEqual({ frame: undefined, video: undefined });
  });

  it("rotate 180: only rotates the video, no frame aspect change (180 doesn't swap the aspect)", () => {
    const { frame, video } = rotatePreviewStyle(180, 1920, 1080);
    expect(frame).toBeUndefined();
    expect(video).toEqual({ transform: "rotate(180deg)" });
  });

  it("rotate 90: gives the frame a definite project-aspect box (size containment) and sizes/rotates the video to fill it", () => {
    const { frame, video } = rotatePreviewStyle(90, 1920, 1080);
    expect(frame).toEqual({ aspectRatio: "1920 / 1080", containerType: "size" });
    expect(video).toEqual({
      position: "absolute",
      top: "50%",
      left: "50%",
      width: "100cqh",
      height: "100cqw",
      transform: "translate(-50%, -50%) rotate(90deg)",
      transformOrigin: "center",
    });
  });

  it("rotate 270: same frame treatment as 90, different rotation angle", () => {
    const { frame, video } = rotatePreviewStyle(270, 1920, 1080);
    expect(frame).toEqual({ aspectRatio: "1920 / 1080", containerType: "size" });
    expect(video).toMatchObject({ transform: "translate(-50%, -50%) rotate(270deg)" });
  });
});

describe("nextRotate", () => {
  it("cycles null -> 90 -> 180 -> 270 -> null", () => {
    expect(nextRotate(null)).toBe(90);
    expect(nextRotate(undefined)).toBe(90);
    expect(nextRotate(90)).toBe(180);
    expect(nextRotate(180)).toBe(270);
    expect(nextRotate(270)).toBeNull();
  });
});
