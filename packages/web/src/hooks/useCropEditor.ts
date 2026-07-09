import { useEffect, useState } from "react";
import type { Crop, Segment } from "@cuesheet/schema";
import { computeLockRatio, maxCropForRatio } from "../lib/cropGeometry.js";
import { useBlockingOverlay } from "../lib/modalStack.js";

export interface UseCropEditorOptions {
  /** The cut being edited - `segment.crop` (if any) seeds the draft when crop edit mode starts. */
  segment: Segment | undefined;
  /** Used (with `naturalSize`) to derive the aspect-ratio lock - see cropGeometry.ts. */
  projectWidth: number;
  projectHeight: number;
  /** The source video's own intrinsic pixel size, once its metadata has loaded (null before). */
  naturalSize: { width: number; height: number } | null;
  /** Commits a crop onto the segment - the same `onChange` prop VideoPreview already threads
      through for in/out/speed/etc, reused here for `{ crop }` patches. */
  onChange: (patch: Partial<Segment>) => void;
}

export interface UseCropEditorResult {
  /** null = not in crop edit mode. A value means an in-progress draft crop (not yet committed). */
  cropEditDraft: Crop | null;
  /** The w/h ratio resize handles are locked to - see cropGeometry.ts's computeLockRatio. */
  lockRatio: number;
  /** Bind directly to CropEditOverlay's onChange - updates the in-progress draft on every drag tick. */
  updateCropDraft: (crop: Crop) => void;
  /** Enters crop edit mode: starts from the existing crop if there is one, otherwise a centered
      70%-of-max ratio-locked box. */
  startCropEdit: () => void;
  applyCropEdit: () => void;
  cancelCropEdit: () => void;
  /** Resets just the draft to the full frame while staying in edit mode (no apply/commit) - a
      shortcut for when dragging handles all the way out to the frame edges is tedious. */
  resetCropEditToFullFrame: () => void;
  clearCropEdit: () => void;
}

/**
 * Crop-edit-mode state for VideoPreview's trim view: the in-progress draft crop, the aspect-ratio
 * lock it's constrained to, and the enter/apply/cancel/clear lifecycle. Registers itself as a
 * blocking overlay (lib/modalStack.ts) so global playback shortcuts don't leak through while
 * dragging, and intercepts Escape (cancel)/Enter (apply) while active. The pixel-math (resize/move
 * geometry) lives in the pure `lib/cropGeometry.ts`; this hook only owns the draft lifecycle.
 */
export function useCropEditor({
  segment,
  projectWidth,
  projectHeight,
  naturalSize,
  onChange,
}: UseCropEditorOptions): UseCropEditorResult {
  const [cropEditDraft, setCropEditDraft] = useState<Crop | null>(null);
  const lockRatio = computeLockRatio(projectWidth, projectHeight, naturalSize);

  const startCropEdit = () => {
    if (!segment) {
      return;
    }
    if (segment.crop) {
      setCropEditDraft(segment.crop);
      return;
    }
    // Starting value for a new crop: a ratio-locked box sized to 70% of the max box (matches
    // the old { x: 0.15, y: 0.15, w: 0.7, h: 0.7 } default exactly when lockRatio===1).
    const max = maxCropForRatio(lockRatio);
    const w = max.w * 0.7;
    const h = max.h * 0.7;
    setCropEditDraft({ x: (1 - w) / 2, y: (1 - h) / 2, w, h });
  };

  const applyCropEdit = () => {
    if (!cropEditDraft) {
      return;
    }
    onChange({ crop: cropEditDraft });
    setCropEditDraft(null);
  };

  const cancelCropEdit = () => {
    setCropEditDraft(null);
  };

  const resetCropEditToFullFrame = () => {
    setCropEditDraft(maxCropForRatio(lockRatio));
  };

  const clearCropEdit = () => {
    onChange({ crop: null });
    setCropEditDraft(null);
  };

  // Registers crop edit mode as a "blocking overlay" (lib/modalStack.ts) - without this, App's
  // global keydown handler would still see the same keydown events crop editing cares about
  // (arrows/space/o/etc, e.g. from the general playback shortcuts) and act on the segment/video
  // underneath while the user is mid-drag on the crop rectangle.
  useBlockingOverlay(cropEditDraft !== null);

  // Intercept Esc (cancel)/Enter (apply) only while crop editing is active.
  useEffect(() => {
    if (!cropEditDraft) {
      return;
    }
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancelCropEdit();
      } else if (e.key === "Enter") {
        e.preventDefault();
        applyCropEdit();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cropEditDraft]);

  return {
    cropEditDraft,
    lockRatio,
    updateCropDraft: setCropEditDraft,
    startCropEdit,
    applyCropEdit,
    cancelCropEdit,
    resetCropEditToFullFrame,
    clearCropEdit,
  };
}
