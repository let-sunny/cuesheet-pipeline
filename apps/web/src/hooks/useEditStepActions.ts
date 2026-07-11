import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import type {
  BgmCue,
  CueSheet,
  Segment,
  SubtitleStyle,
  SubtitleStyleOverride,
  Title,
  Transition,
} from "@cuesheet/schema";
import { cumulativeCutStarts, cutRangeToSeconds } from "../lib/bgmCutMapping.js";
import { computeMergeEligibility } from "../lib/segmentMerge.js";

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

/** Default span (in cuts) a freshly added BGM track covers, when there are enough cuts to fill it -
 * through cut 3 (index 2). Chosen so a new track is immediately visible/draggable without already
 * spanning the whole episode. */
const DEFAULT_BGM_TRACK_SPAN_CUTS = 3;

/**
 * All the "edit this cut's fields" / "edit this BGM track" handlers backing the (2) Edit step —
 * SegmentQuickFields, BgmSettingsPanel, and CompactSegmentList's cut-list actions. Also backs the
 * global Cmd+J / Cmd+B shortcuts (mergeSegmentWithNext), which is why this hook is called
 * unconditionally in App.tsx rather than only while the Edit step is mounted.
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
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const segments = prev.segments.map((s, idx) => (idx === i ? { ...s, ...patch } : s));
      return { ...prev, segments };
    });
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
      const source = prev.segments[selectedIndex];
      if (!source) {
        return prev;
      }
      const insertAt = selectedIndex + 1;
      const segments = [...prev.segments];
      segments.splice(insertAt, 0, { ...source, subtitle: "" });
      setSelectedIndex(insertAt);
      return { ...prev, segments };
    });
  }, [draft, recordDiscreteChange, selectedIndex, setDraft, setSelectedIndex]);

  const removeSegment = useCallback((i: number) => {
    if (!draft || draft.segments.length <= 1) {
      return;
    }
    recordDiscreteChange();
    setDraft((prev) => {
      if (!prev || prev.segments.length <= 1) {
        return prev;
      }
      const segments = prev.segments.filter((_, idx) => idx !== i);
      return { ...prev, segments };
    });
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
      const segments = [...prev.segments];
      const a = segments[i];
      const b = segments[target];
      if (!a || !b) {
        return prev;
      }
      segments[i] = b;
      segments[target] = a;
      setSelectedIndex(target);
      return { ...prev, segments };
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
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const s = prev.segments[i];
      if (!s) {
        return prev;
      }
      if (at - s.in < 0.2 || s.out - at < 0.2) {
        return prev;
      }
      const first: Segment = { ...s, out: at };
      const second: Segment = { ...s, in: at, subtitle: "" };
      const segments = [...prev.segments];
      segments.splice(i, 1, first, second);
      return { ...prev, segments };
    });
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
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const cur = prev.segments[i];
      const nxt = prev.segments[i + 1];
      if (!cur || !nxt) {
        return prev;
      }
      const merged: Segment = { ...cur, out: nxt.out };
      const segments = [...prev.segments];
      segments.splice(i, 2, merged);
      return { ...prev, segments };
    });
  }, [draft, recordDiscreteChange, setDraft]);

  const clearSegmentCrop = useCallback((i: number) => {
    if (!draft) {
      return;
    }
    recordDiscreteChange();
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const segments = prev.segments.map((s, idx) => (idx === i ? { ...s, crop: null } : s));
      return { ...prev, segments };
    });
  }, [draft, recordDiscreteChange, setDraft]);

  const updateBgm = useCallback((i: number, patch: Partial<BgmCue>) => {
    if (!draft) {
      return;
    }
    recordContinuousChange();
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const bgm = prev.bgm.map((c, idx) => (idx === i ? { ...c, ...patch } : c));
      return { ...prev, bgm };
    });
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
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const cumStart = cumulativeCutStarts(prev.segments);
      const lastCutIdx = prev.segments.length - 1;
      const endCutIdx = Math.min(lastCutIdx, DEFAULT_BGM_TRACK_SPAN_CUTS - 1);
      const { start, end } = cutRangeToSeconds(0, endCutIdx, cumStart);
      const cue: BgmCue = { file: "", start, end, volume: 1 };
      return { ...prev, bgm: [...prev.bgm, cue] };
    });
    setSelectedBgmIndex(newIndex);
  }, [draft, recordDiscreteChange, setDraft, setSelectedBgmIndex]);

  // Moves/resizes a track by cut index (drag in the gutter, or the settings panel's numeric
  // fields) - converts back to the seconds actually stored/rendered.
  const changeBgmRange = useCallback((bgmIndex: number, startCutIdx: number, endCutIdx: number) => {
    if (!draft) {
      return;
    }
    recordContinuousChange();
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const cumStart = cumulativeCutStarts(prev.segments);
      const { start, end } = cutRangeToSeconds(startCutIdx, endCutIdx, cumStart);
      const bgm = prev.bgm.map((c, idx) => (idx === bgmIndex ? { ...c, start, end } : c));
      return { ...prev, bgm };
    });
  }, [draft, recordContinuousChange, setDraft]);

  const removeBgmTrack = useCallback((i: number) => {
    if (!draft) {
      return;
    }
    recordDiscreteChange();
    setDraft((prev) => (prev ? { ...prev, bgm: prev.bgm.filter((_, idx) => idx !== i) } : prev));
    setSelectedBgmIndex(null);
  }, [draft, recordDiscreteChange, setDraft, setSelectedBgmIndex]);

  // "Style for this cut only" toggle — turning it on starts the override as a straight copy of the
  // global subtitleStyle (so the visible value doesn't change the instant it's toggled), letting
  // the user adjust values from there. Turning it off (= clearing the override) removes the
  // styleOverride key. The toggle itself is a discrete edit.
  const toggleSegmentStyleOverride = useCallback((i: number, enabled: boolean) => {
    if (!draft) {
      return;
    }
    recordDiscreteChange();
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const segments = prev.segments.map((s, idx) =>
        idx === i ? (enabled ? { ...s, styleOverride: { ...prev.subtitleStyle } } : withoutStyleOverride(s)) : s,
      );
      return { ...prev, segments };
    });
  }, [draft, recordDiscreteChange, setDraft]);

  const updateSegmentStyleOverride = useCallback((i: number, patch: Partial<SubtitleStyleOverride>) => {
    if (!draft) {
      return;
    }
    recordContinuousChange();
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const segments = prev.segments.map((s, idx) =>
        idx === i ? { ...s, styleOverride: { ...(s.styleOverride ?? {}), ...patch } } : s,
      );
      return { ...prev, segments };
    });
  }, [draft, recordContinuousChange, setDraft]);

  const clearSegmentStyleOverride = useCallback((i: number) => {
    if (!draft) {
      return;
    }
    recordDiscreteChange();
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const segments = prev.segments.map((s, idx) => (idx === i ? withoutStyleOverride(s) : s));
      return { ...prev, segments };
    });
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
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const target = prev.segments[i];
      if (!target?.styleOverride) {
        return prev;
      }
      const mergedGlobal: SubtitleStyle = { ...prev.subtitleStyle, ...target.styleOverride };
      const segments = prev.segments.map((s, idx) => (idx === i ? withoutStyleOverride(s) : s));
      return { ...prev, subtitleStyle: mergedGlobal, segments };
    });
  }, [draft, recordDiscreteChange, setDraft]);

  // "Style preset" select in Cut settings (SUBTITLE group) - "" clears back to no preset (null,
  // consistent with the schema's nullable stylePreset - the merge rule treats null the same as
  // omitted, so there's no need to special-case it away).
  const changeSegmentStylePreset = useCallback((i: number, presetName: string | null) => {
    if (!draft) {
      return;
    }
    recordDiscreteChange();
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const segments = prev.segments.map((s, idx) => (idx === i ? { ...s, stylePreset: presetName } : s));
      return { ...prev, segments };
    });
  }, [draft, recordDiscreteChange, setDraft]);

  // "Title card for this cut" toggle - turning it on starts from a sane default (typing, 3s, no
  // dim) so the preview shows something immediately, same pattern as the subtitle style override toggle.
  const toggleSegmentTitle = useCallback((i: number, enabled: boolean) => {
    if (!draft) {
      return;
    }
    recordDiscreteChange();
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const segments = prev.segments.map((s, idx) =>
        idx === i
          ? enabled
            ? {
                ...s,
                title: {
                  text: DEFAULT_TITLE_TEXT,
                  preset: "typing" as const,
                  durationS: DEFAULT_TITLE_DURATION_S,
                  color: DEFAULT_TITLE_COLOR,
                  size: DEFAULT_TITLE_SIZE,
                },
              }
            : withoutTitle(s)
          : s,
      );
      return { ...prev, segments };
    });
  }, [draft, recordDiscreteChange, setDraft]);

  const updateSegmentTitle = useCallback((i: number, patch: Partial<Title>) => {
    if (!draft) {
      return;
    }
    recordContinuousChange();
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const segments = prev.segments.map((s, idx) =>
        idx === i && s.title ? { ...s, title: { ...s.title, ...patch } } : s,
      );
      return { ...prev, segments };
    });
  }, [draft, recordContinuousChange, setDraft]);

  // "Transition in"/"Transition out" toggle (PRD backlog #3) - turning one on starts from a sane
  // default (fade, 0.5s) so the preview shows something immediately, same pattern as the Title
  // toggle above.
  const toggleSegmentTransition = useCallback((i: number, side: "in" | "out", enabled: boolean) => {
    if (!draft) {
      return;
    }
    recordDiscreteChange();
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const key = side === "in" ? "transitionIn" : "transitionOut";
      const segments = prev.segments.map((s, idx) =>
        idx === i
          ? enabled
            ? { ...s, [key]: { type: "fade" as const, durationS: DEFAULT_TRANSITION_DURATION_S } }
            : withoutTransition(s, side)
          : s,
      );
      return { ...prev, segments };
    });
  }, [draft, recordDiscreteChange, setDraft]);

  const updateSegmentTransition = useCallback((i: number, side: "in" | "out", patch: Partial<Transition>) => {
    if (!draft) {
      return;
    }
    recordContinuousChange();
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const key = side === "in" ? "transitionIn" : "transitionOut";
      const segments = prev.segments.map((s, idx) => {
        if (idx !== i) {
          return s;
        }
        const current = side === "in" ? s.transitionIn : s.transitionOut;
        return current ? { ...s, [key]: { ...current, ...patch } } : s;
      });
      return { ...prev, segments };
    });
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

// When clearing an override, drop the styleOverride key entirely (don't leave the value as null) —
// null is also schema-valid as "no override" (nullable), but this standardizes on omission
// (undefined) to avoid leaving an unnecessary "styleOverride": null in the saved file.
function withoutStyleOverride(segment: Segment): Segment {
  const { styleOverride: _styleOverride, ...rest } = segment;
  return rest;
}

// Same convention as withoutStyleOverride: drop the `title` key entirely (rather than leaving it
// null) when a cut's title card is turned off.
function withoutTitle(segment: Segment): Segment {
  const { title: _title, ...rest } = segment;
  return rest;
}

// Same convention as withoutTitle: drop the `transitionIn`/`transitionOut` key entirely (rather
// than leaving it null) when that side's transition is turned off.
function withoutTransition(segment: Segment, side: "in" | "out"): Segment {
  if (side === "in") {
    const { transitionIn: _transitionIn, ...rest } = segment;
    return rest;
  }
  const { transitionOut: _transitionOut, ...rest } = segment;
  return rest;
}

/** Matches the schema's title.durationS default (3) - the value shown right after the toggle is turned on, before onChangeTitle's first patch lands. */
const DEFAULT_TITLE_DURATION_S = 3;

/** Default text a title card starts with when the toggle is turned on (2026-07-09 QA-2 fix) - a
 * blank string left the preview showing nothing at all until the user typed something, which read
 * as "did this even turn on?"; "Title" is schema-valid (any string) and visibly confirms the
 * toggle worked, same as Title's other fields (Typing preset, 3s) already default to something. */
const DEFAULT_TITLE_TEXT = "Title";

/** Matches the schema's title.color default (white, so the title reads over most footage) - see
 * packages/render/src/remotion/titleCardStyle.ts's TITLE_TEXT_COLOR. */
const DEFAULT_TITLE_COLOR = "#ffffff";

/** Matches the schema's title.size default - see
 * packages/render/src/remotion/titleCardStyle.ts's TITLE_FONT_SIZE_PX. */
const DEFAULT_TITLE_SIZE = 100;

/** Matches the schema's transition.durationS default (0.5) - the value written when a Transition
 * in/out toggle is first turned on. */
const DEFAULT_TRANSITION_DURATION_S = 0.5;
