import type { CueSheet, Segment, Transition } from "@cuesheet/schema";

/** Matches the schema's transition.durationS default (0.5) - the value written when a Transition
 * in/out toggle is first turned on. */
export const DEFAULT_TRANSITION_DURATION_S = 0.5;

/**
 * "Transition in"/"Transition out" toggle (PRD backlog #3) - turning one on starts from a sane
 * default (fade, 0.5s) so the preview shows something immediately, same pattern as the Title
 * toggle. Turning it off removes that side's `transitionIn`/`transitionOut` key entirely.
 */
export function toggleSegmentTransitionAt(cue: CueSheet, i: number, side: "in" | "out", enabled: boolean): CueSheet {
  const key = side === "in" ? "transitionIn" : "transitionOut";
  const segments = cue.segments.map((s, idx) =>
    idx === i
      ? enabled
        ? { ...s, [key]: { type: "fade" as const, durationS: DEFAULT_TRANSITION_DURATION_S } }
        : withoutTransition(s, side)
      : s,
  );
  return { ...cue, segments };
}

/** Patches segment i's transitionIn/transitionOut (a no-op when that side has no transition set). */
export function updateSegmentTransitionAt(
  cue: CueSheet,
  i: number,
  side: "in" | "out",
  patch: Partial<Transition>,
): CueSheet {
  const key = side === "in" ? "transitionIn" : "transitionOut";
  const segments = cue.segments.map((s, idx) => {
    if (idx !== i) {
      return s;
    }
    const current = side === "in" ? s.transitionIn : s.transitionOut;
    return current ? { ...s, [key]: { ...current, ...patch } } : s;
  });
  return { ...cue, segments };
}

// Same convention as titleEditing's withoutTitle: drop the `transitionIn`/`transitionOut` key
// entirely (rather than leaving it null) when that side's transition is turned off.
function withoutTransition(segment: Segment, side: "in" | "out"): Segment {
  if (side === "in") {
    const { transitionIn: _transitionIn, ...rest } = segment;
    return rest;
  }
  const { transitionOut: _transitionOut, ...rest } = segment;
  return rest;
}
