import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { CueSheet, Segment } from "@cuesheet/schema";

export interface UseComposeStepActionsOptions {
  draft: CueSheet | null;
  setDraft: Dispatch<SetStateAction<CueSheet | null>>;
  recordDiscreteChange: () => void;
  setSelectedIndex: Dispatch<SetStateAction<number>>;
}

export interface UseComposeStepActionsResult {
  /** Adds a segment built from a palette moment card, inserted in chronological (clip, in) order. */
  addMomentSegment: (seg: Segment) => void;
  /** "Remove" on a palette card — drops any added segments overlapping the card's range. */
  removeMatchingSegments: (clip: string, inS: number, outS: number) => void;
}

/** The MomentPalette "Add"/"Remove" handlers backing the (1) Compose step. */
export function useComposeStepActions({
  draft,
  setDraft,
  recordDiscreteChange,
  setSelectedIndex,
}: UseComposeStepActionsOptions): UseComposeStepActionsResult {
  const addMomentSegment = useCallback((seg: Segment) => {
    if (!draft) {
      return;
    }
    recordDiscreteChange();
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      // Wherever it's added from, insert at the time-ordered position keyed on (clip file name, in) — so the order never gets scrambled.
      const idx = prev.segments.findIndex(
        (s) => s.clip > seg.clip || (s.clip === seg.clip && s.in > seg.in),
      );
      const insertAt = idx === -1 ? prev.segments.length : idx;
      const segments = [...prev.segments];
      segments.splice(insertAt, 0, seg);
      setSelectedIndex(insertAt);
      return { ...prev, segments };
    });
  }, [draft, recordDiscreteChange, setDraft, setSelectedIndex]);

  // "Remove" on a palette card — removes segments from the added list that overlap the card's
  // range within the same clip (uses the same overlap criterion as MomentPalette's "in use" check).
  const removeMatchingSegments = useCallback((clip: string, inS: number, outS: number) => {
    if (!draft) {
      return;
    }
    const willRemain = draft.segments.filter(
      (s) => !(s.clip === clip && s.in < outS && s.out > inS),
    );
    if (willRemain.length === draft.segments.length || willRemain.length === 0) {
      return;
    }
    recordDiscreteChange();
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const segments = prev.segments.filter(
        (s) => !(s.clip === clip && s.in < outS && s.out > inS),
      );
      if (segments.length === prev.segments.length || segments.length === 0) {
        return prev;
      }
      return { ...prev, segments };
    });
  }, [draft, recordDiscreteChange, setDraft]);

  return { addMomentSegment, removeMatchingSegments };
}
