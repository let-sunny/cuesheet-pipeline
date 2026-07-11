import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import type {
  BgmCue,
  CueSheet,
  Segment,
  SubtitleStyleOverride,
  Title,
  Transition,
} from "@cuesheet/schema";
import { addBgmTrackToSheet, changeBgmRangeInSheet, removeBgmTrackAt, updateBgmAt } from "../lib/bgmEditing.js";
import {
  clearSegmentCropAt,
  duplicateSegmentAfter,
  removeSegmentAt,
  splitSegmentAt,
  swapSegmentAt,
  updateSegmentInSheet,
} from "../lib/segmentListEditing.js";
import { computeMergeEligibility, mergeSegmentAt } from "../lib/segmentMerge.js";
import {
  changeSegmentStylePresetAt,
  clearSegmentStyleOverrideAt,
  promoteSegmentStyleOverrideAt,
  toggleSegmentStyleOverrideAt,
  updateSegmentStyleOverrideAt,
} from "../lib/subtitleStyleOverrideEditing.js";
import { toggleSegmentTitleAt, updateSegmentTitleAt } from "../lib/titleEditing.js";
import { toggleSegmentTransitionAt, updateSegmentTransitionAt } from "../lib/transitionEditing.js";

export interface UseEditStepActionsOptions {
  draft: CueSheet | null;
  setDraft: Dispatch<SetStateAction<CueSheet | null>>;
  recordDiscreteChange: () => void;
  recordContinuousChange: () => void;
  selectedIndex: number;
  setSelectedIndex: Dispatch<SetStateAction<number>>;
  setSelectedBgmIndex: Dispatch<SetStateAction<number | null>>;
}

export interface UseEditStepActionsResult {
  updateSegment: (i: number, patch: Partial<Segment>) => void;
  /** The "Add segment" button — duplicates the selected cut right after it (see the doc comment
   * on the callback body for why, ported from App.tsx unchanged). */
  addSegment: () => void;
  removeSegment: (i: number) => void;
  moveSegment: (i: number, direction: -1 | 1) => void;
  splitSegment: (i: number, at: number) => void;
  /** Merge adjacent cuts (Cmd+J / inspector button) — also used by the global keyboard shortcut. */
  mergeSegmentWithNext: (i: number) => void;
  clearSegmentCrop: (i: number) => void;
  updateBgm: (i: number, patch: Partial<BgmCue>) => void;
  addBgmTrack: () => void;
  changeBgmRange: (bgmIndex: number, startCutIdx: number, endCutIdx: number) => void;
  removeBgmTrack: (i: number) => void;
  toggleSegmentStyleOverride: (i: number, enabled: boolean) => void;
  updateSegmentStyleOverride: (i: number, patch: Partial<SubtitleStyleOverride>) => void;
  promoteSegmentStyleOverride: (i: number) => void;
  clearSegmentStyleOverride: (i: number) => void;
  changeSegmentStylePreset: (i: number, presetName: string | null) => void;
  toggleSegmentTitle: (i: number, enabled: boolean) => void;
  updateSegmentTitle: (i: number, patch: Partial<Title>) => void;
  toggleSegmentTransition: (i: number, side: "in" | "out", enabled: boolean) => void;
  updateSegmentTransition: (i: number, side: "in" | "out", patch: Partial<Transition>) => void;
}

/**
 * All the "edit this cut's fields" / "edit this BGM track" handlers backing the (2) Edit step —
 * SegmentQuickFields, BgmSettingsPanel, and CompactSegmentList's cut-list actions. Also backs the
 * global Cmd+J / Cmd+B shortcuts (mergeSegmentWithNext), which is why this hook is called
 * unconditionally in App.tsx rather than only while the Edit step is mounted.
 *
 * Each action here is thin wiring (guard -> record the change -> setDraft) over a pure
 * draft-transformation function in src/lib/ (segmentListEditing.ts, segmentMerge.ts,
 * bgmEditing.ts, subtitleStyleOverrideEditing.ts, titleEditing.ts, transitionEditing.ts) - those
 * modules hold the actual logic and are unit-tested directly; this hook only owns the React
 * plumbing (draft/setDraft, change recording, selection state, confirm() prompts).
 */
export function useEditStepActions({
  draft,
  setDraft,
  recordDiscreteChange,
  recordContinuousChange,
  selectedIndex,
  setSelectedIndex,
  setSelectedBgmIndex,
}: UseEditStepActionsOptions): UseEditStepActionsResult {
  const updateSegment = useCallback((i: number, patch: Partial<Segment>) => {
    if (!draft) {
      return;
    }
    recordContinuousChange();
    setDraft((prev) => (prev ? updateSegmentInSheet(prev, i, patch) : prev));
  }, [draft, recordContinuousChange, setDraft]);

  // The "Add segment" button — the previous behavior of appending an empty cut at the end was the
  // cause of user complaints about "not knowing what to do after clicking" (a clip-less empty cut
  // showed only "no clip" in the inspector, requiring the file name to be typed in manually).
  // Instead, this duplicates the selected cut right after it — this directly matches the most
  // common real-world pattern of splitting a different range of the same clip into another cut
  // (e.g. using two moments from the same long take as separate cuts), and the duplicate starts
  // with clip/in/out/crop already filled in, needing only a trim (the subtitle is left empty to
  // signal that it needs to be rewritten).
  const addSegment = useCallback(() => {
    if (!draft) {
      return;
    }
    recordDiscreteChange();
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const result = duplicateSegmentAfter(prev, selectedIndex);
      if (!result) {
        return prev;
      }
      setSelectedIndex(result.insertAt);
      return result.cue;
    });
  }, [draft, recordDiscreteChange, selectedIndex, setDraft, setSelectedIndex]);

  const removeSegment = useCallback((i: number) => {
    if (!draft || draft.segments.length <= 1) {
      return;
    }
    recordDiscreteChange();
    setDraft((prev) => (prev ? (removeSegmentAt(prev, i) ?? prev) : prev));
  }, [draft, recordDiscreteChange, setDraft]);

  const moveSegment = useCallback((i: number, direction: -1 | 1) => {
    if (!draft) {
      return;
    }
    const target = i + direction;
    if (target < 0 || target >= draft.segments.length) {
      return;
    }
    recordDiscreteChange();
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const result = swapSegmentAt(prev, i, direction);
      if (!result) {
        return prev;
      }
      setSelectedIndex(result.newIndex);
      return result.cue;
    });
  }, [draft, recordDiscreteChange, setDraft, setSelectedIndex]);

  const splitSegment = useCallback((i: number, at: number) => {
    if (!draft) {
      return;
    }
    const seg = draft.segments[i];
    if (!seg) {
      return;
    }
    if (at - seg.in < 0.2 || seg.out - at < 0.2) {
      return;
    }
    recordDiscreteChange();
    setDraft((prev) => (prev ? (splitSegmentAt(prev, i, at) ?? prev) : prev));
  }, [draft, recordDiscreteChange, setDraft]);

  const mergeSegmentWithNext = useCallback((i: number) => {
    if (!draft) {
      return;
    }
    const eligibility = computeMergeEligibility(draft, i);
    if (!eligibility.eligible) {
      return;
    }
    const current = draft.segments[i];
    const next = draft.segments[i + 1];
    if (!current || !next) {
      return;
    }
    if (next.subtitle.trim() !== "" && next.subtitle.trim() !== current.subtitle.trim()) {
      const confirmed = window.confirm("The next cut's subtitle will be discarded. Continue?");
      if (!confirmed) {
        return;
      }
    }
    recordDiscreteChange();
    setDraft((prev) => (prev ? (mergeSegmentAt(prev, i) ?? prev) : prev));
  }, [draft, recordDiscreteChange, setDraft]);

  const clearSegmentCrop = useCallback((i: number) => {
    if (!draft) {
      return;
    }
    recordDiscreteChange();
    setDraft((prev) => (prev ? clearSegmentCropAt(prev, i) : prev));
  }, [draft, recordDiscreteChange, setDraft]);

  const updateBgm = useCallback((i: number, patch: Partial<BgmCue>) => {
    if (!draft) {
      return;
    }
    recordContinuousChange();
    setDraft((prev) => (prev ? updateBgmAt(prev, i, patch) : prev));
  }, [draft, recordContinuousChange, setDraft]);

  // Adds a track (the Edit step gutter's "+ Add track" button) - defaults to starting at cut 1
  // (the top of the list) through a short initial span, rather than anchoring to whichever cut
  // happens to be selected: the gutter is a vertical list read top-down, so a track that doesn't
  // start at the top reads as a bug ("why does it start mid-list?"). The user extends it by
  // dragging the end handle down to the desired cut.
  const addBgmTrack = useCallback(() => {
    if (!draft) {
      return;
    }
    recordDiscreteChange();
    const newIndex = draft.bgm.length;
    setDraft((prev) => (prev ? addBgmTrackToSheet(prev).cue : prev));
    setSelectedBgmIndex(newIndex);
  }, [draft, recordDiscreteChange, setDraft, setSelectedBgmIndex]);

  // Moves/resizes a track by cut index (drag in the gutter, or the settings panel's numeric
  // fields) - converts back to the seconds actually stored/rendered.
  const changeBgmRange = useCallback((bgmIndex: number, startCutIdx: number, endCutIdx: number) => {
    if (!draft) {
      return;
    }
    recordContinuousChange();
    setDraft((prev) => (prev ? changeBgmRangeInSheet(prev, bgmIndex, startCutIdx, endCutIdx) : prev));
  }, [draft, recordContinuousChange, setDraft]);

  const removeBgmTrack = useCallback((i: number) => {
    if (!draft) {
      return;
    }
    recordDiscreteChange();
    setDraft((prev) => (prev ? removeBgmTrackAt(prev, i) : prev));
    setSelectedBgmIndex(null);
  }, [draft, recordDiscreteChange, setDraft, setSelectedBgmIndex]);

  const toggleSegmentStyleOverride = useCallback((i: number, enabled: boolean) => {
    if (!draft) {
      return;
    }
    recordDiscreteChange();
    setDraft((prev) => (prev ? toggleSegmentStyleOverrideAt(prev, i, enabled) : prev));
  }, [draft, recordDiscreteChange, setDraft]);

  const updateSegmentStyleOverride = useCallback((i: number, patch: Partial<SubtitleStyleOverride>) => {
    if (!draft) {
      return;
    }
    recordContinuousChange();
    setDraft((prev) => (prev ? updateSegmentStyleOverrideAt(prev, i, patch) : prev));
  }, [draft, recordContinuousChange, setDraft]);

  const clearSegmentStyleOverride = useCallback((i: number) => {
    if (!draft) {
      return;
    }
    recordDiscreteChange();
    setDraft((prev) => (prev ? clearSegmentStyleOverrideAt(prev, i) : prev));
  }, [draft, recordDiscreteChange, setDraft]);

  // "Promote to global style" — merges this cut's override into the global subtitleStyle and
  // removes this cut's override (this is a confirmed edit since it affects other cuts too).
  // Bundles the two field changes (subtitleStyle, segments[i].styleOverride) into one history entry.
  const promoteSegmentStyleOverride = useCallback((i: number) => {
    if (!draft) {
      return;
    }
    const seg = draft.segments[i];
    if (!seg?.styleOverride) {
      return;
    }
    const confirmed = window.confirm(
      "Apply this cut's subtitle style to all cuts? This cut's individual style will be removed.",
    );
    if (!confirmed) {
      return;
    }
    recordDiscreteChange();
    setDraft((prev) => (prev ? (promoteSegmentStyleOverrideAt(prev, i) ?? prev) : prev));
  }, [draft, recordDiscreteChange, setDraft]);

  // "Style preset" select in Cut settings (SUBTITLE group) - "" clears back to no preset (null,
  // consistent with the schema's nullable stylePreset - the merge rule treats null the same as
  // omitted, so there's no need to special-case it away).
  const changeSegmentStylePreset = useCallback((i: number, presetName: string | null) => {
    if (!draft) {
      return;
    }
    recordDiscreteChange();
    setDraft((prev) => (prev ? changeSegmentStylePresetAt(prev, i, presetName) : prev));
  }, [draft, recordDiscreteChange, setDraft]);

  const toggleSegmentTitle = useCallback((i: number, enabled: boolean) => {
    if (!draft) {
      return;
    }
    recordDiscreteChange();
    setDraft((prev) => (prev ? toggleSegmentTitleAt(prev, i, enabled) : prev));
  }, [draft, recordDiscreteChange, setDraft]);

  const updateSegmentTitle = useCallback((i: number, patch: Partial<Title>) => {
    if (!draft) {
      return;
    }
    recordContinuousChange();
    setDraft((prev) => (prev ? updateSegmentTitleAt(prev, i, patch) : prev));
  }, [draft, recordContinuousChange, setDraft]);

  const toggleSegmentTransition = useCallback((i: number, side: "in" | "out", enabled: boolean) => {
    if (!draft) {
      return;
    }
    recordDiscreteChange();
    setDraft((prev) => (prev ? toggleSegmentTransitionAt(prev, i, side, enabled) : prev));
  }, [draft, recordDiscreteChange, setDraft]);

  const updateSegmentTransition = useCallback((i: number, side: "in" | "out", patch: Partial<Transition>) => {
    if (!draft) {
      return;
    }
    recordContinuousChange();
    setDraft((prev) => (prev ? updateSegmentTransitionAt(prev, i, side, patch) : prev));
  }, [draft, recordContinuousChange, setDraft]);

  return {
    updateSegment,
    addSegment,
    removeSegment,
    moveSegment,
    splitSegment,
    mergeSegmentWithNext,
    clearSegmentCrop,
    updateBgm,
    addBgmTrack,
    changeBgmRange,
    removeBgmTrack,
    toggleSegmentStyleOverride,
    updateSegmentStyleOverride,
    promoteSegmentStyleOverride,
    clearSegmentStyleOverride,
    changeSegmentStylePreset,
    toggleSegmentTitle,
    updateSegmentTitle,
    toggleSegmentTransition,
    updateSegmentTransition,
  };
}
