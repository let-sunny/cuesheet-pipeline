import type { CSSProperties } from "react";
import type { Rotate } from "@cuesheet/schema";

/** Cycles a segment's rotate field: null -> 90 -> 180 -> 270 -> null, for a single toggle button. */
export function nextRotate(current: Rotate | null | undefined): Rotate | null {
  if (current === 90) return 180;
  if (current === 180) return 270;
  if (current === 270) return null;
  return 90;
}

/**
 * CSS approximation for previewing a segment forced to rotate (see rotateSchema's doc comment in
 * @cuesheet/schema). The real render (@cuesheet/render) applies an ffmpeg transpose/flip filter
 * BEFORE scaling to the project's W:H (every segment always fills the full project canvas, by
 * definition of that stretch-to-fill scale) - the web preview doesn't need to reproduce that
 * exact pixel result (the render is the ground truth, same philosophy as cropPreview.ts), but it
 * does need to avoid showing the video still in its un-rotated (e.g. portrait) shape.
 *
 * 90/180: CSS `transform: rotate()` alone doesn't swap an element's own box dimensions, so for a
 * 90/270 rotation this also returns a `frame` style that gives the *container* (not the video) a
 * definite box in the project's aspect ratio, with `containerType: "size"` so cqw/cqh container
 * query units become available - letting `video` size itself to exactly the frame's height/width
 * (swapped) via `100cqh`/`100cqw` before rotating, so after rotation it exactly fills the frame.
 * 180 doesn't swap the aspect, so it only needs the `video` transform, not a frame change.
 *
 * NOTE: not composed with cropPreviewStyle - no segment currently needs both at once, and crop's
 * ratios are defined relative to the already-rotated frame (see rotateSchema), which this preview
 * doesn't attempt to visualize together. The render is the ground truth either way.
 */
export function rotatePreviewStyle(
  rotate: Rotate | null | undefined,
  projectWidth: number,
  projectHeight: number,
): { frame: CSSProperties | undefined; video: CSSProperties | undefined } {
  if (!rotate) {
    return { frame: undefined, video: undefined };
  }
  if (rotate === 180) {
    return { frame: undefined, video: { transform: "rotate(180deg)" } };
  }
  return {
    frame: {
      aspectRatio: `${projectWidth} / ${projectHeight}`,
      containerType: "size",
    },
    video: {
      position: "absolute",
      top: "50%",
      left: "50%",
      width: "100cqh",
      height: "100cqw",
      transform: `translate(-50%, -50%) rotate(${rotate}deg)`,
      transformOrigin: "center",
    },
  };
}
