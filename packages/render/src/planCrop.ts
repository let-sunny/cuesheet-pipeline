import type { CueSheet } from "@cuesheet/schema";

export interface SourceDimensions {
  width: number;
  height: number;
}

/**
 * Verifies that each cropped segment's actual pixel aspect ratio (crop.w*srcWidth /
 * crop.h*srcHeight) matches the project's aspect ratio (project.width/project.height) within
 * CROP_ASPECT_TOLERANCE — beyond that, render/plan.ts's crop -> scale=W:H (no letterboxing)
 * would stretch the image. Throws a field-path style error naming the offending cut; a no-op
 * for segments with no crop or no matching sourceDimensions entry.
 */
export function assertCropMatchesProjectAspect(
  cue: CueSheet,
  sourceDimensions?: Record<string, SourceDimensions>,
): void {
  if (!sourceDimensions) return;
  const projectAspect = cue.project.width / cue.project.height;
  cue.segments.forEach((s, i) => {
    if (!s.crop) return;
    const dims = sourceDimensions[s.clip];
    if (!dims) return;
    const cropAspect = (s.crop.w * dims.width) / (s.crop.h * dims.height);
    const deviation = Math.abs(cropAspect - projectAspect) / projectAspect;
    if (deviation > CROP_ASPECT_TOLERANCE) {
      throw new Error(
        `segments[${i}].crop: clip "${s.clip}" (source ${dims.width}x${dims.height}) crop aspect ` +
          `${cropAspect.toFixed(3)} deviates from project aspect ${projectAspect.toFixed(3)} by ` +
          `more than ${CROP_ASPECT_TOLERANCE * 100}%`,
      );
    }
  });
}

/** Relative tolerance for the crop-vs-project-aspect check (1%). */
const CROP_ASPECT_TOLERANCE = 0.01;
