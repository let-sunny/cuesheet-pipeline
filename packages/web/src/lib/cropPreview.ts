import type { CSSProperties } from "react";
import type { Crop } from "@cuesheet/schema";

/**
 * CSS approximation for previewing a segment that has a crop.
 * The real render (@cuesheet/render) actually cuts with an ffmpeg crop filter and then scales up to fill
 * the project size, but the web preview doesn't need to reproduce that exact pixel result (the render is
 * the ground truth) — here it's enough to simulate, inside an overflow:hidden container wrapping <video>,
 * showing only the crop area via scale+translate, just to eliminate the "cropped but the face is still
 * visible" problem.
 *
 * Fixing transform-origin at (0,0) and applying scale(1/w, 1/h) translate(-x*100%, -y*100%) aligns the
 * crop rectangle's top-left (x,y) with the container's top-left (0,0), and its bottom-right (x+w,y+h) with
 * the container's bottom-right (1,1). translate's % is relative to the element's (the video's) own layout
 * box size and isn't multiplied by scale, so this ordering is sufficient.
 */
export function cropPreviewStyle(crop: Crop | null | undefined): CSSProperties | undefined {
  if (!crop) {
    return undefined;
  }
  const { x, y, w, h } = crop;
  return {
    transformOrigin: "0 0",
    transform: `scale(${1 / w}, ${1 / h}) translate(${-x * 100}%, ${-y * 100}%)`,
  };
}
