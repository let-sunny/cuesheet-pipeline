import type { Transition } from "@cuesheet/schema";

/**
 * Preview approximation for a cut's transitionIn/transitionOut (PRD backlog #3) - drives a CSS
 * `opacity` ramp on the `<video>` element in VideoPreview/SequencePlayer instead of reproducing the
 * real render's fade/dip filter graph (packages/render/src/plan.ts's applyTransition). This is
 * explicitly an approximation (parity note shown in the UI, see SegmentQuickFields' Transitions
 * group): like the existing Title preview (TitleOverlay.tsx), it reuses the playback clock's raw
 * elapsed *source* time (`currentTime - segment.in`) rather than the speed-adjusted output time the
 * real render offsets are computed on, and it darkens the whole frame via opacity rather than
 * overlaying a separate black layer (dip's "partial dim never fully hides the frame" nuance is
 * still respected - see transitionAmountAt below - but the render's underlying-footage-still-visible
 * effect isn't reproducible through opacity alone).
 */

/**
 * How much a single transition (in or out) currently darkens the frame, 0 (not at all) to
 * `dim` (1 for "fade", or the dip's own dim for "dip") at its peak. Mirrors the render's envelope
 * shape: "in" starts at its peak (t=0) and ramps down to 0 by durationS; "out" starts at 0 and
 * ramps up to its peak by the segment's end (durationS, the source in~out length here - see the
 * module doc for why this differs from the render's output-time offsets).
 */
export function transitionAmountAt(
  transition: Transition | null | undefined,
  side: "in" | "out",
  durationS: number,
  localTimeS: number,
): number {
  if (!transition || durationS <= 0) {
    return 0;
  }
  const d = Math.min(transition.durationS, durationS);
  const peak = transition.type === "dip" ? (transition.dim ?? 1) : 1;
  if (side === "in") {
    if (localTimeS <= 0) return peak;
    if (localTimeS >= d) return 0;
    return peak * (1 - localTimeS / d);
  }
  const st = durationS - d;
  if (localTimeS <= st) return 0;
  if (localTimeS >= durationS) return peak;
  return peak * ((localTimeS - st) / d);
}

/**
 * Combined opacity (0-1) to apply to the `<video>` element at the current playback position -
 * whichever of transitionIn/transitionOut darkens the frame more at this instant wins (their
 * windows don't normally overlap on a cut long enough to hold both).
 */
export function transitionOpacity(
  transitionIn: Transition | null | undefined,
  transitionOut: Transition | null | undefined,
  durationS: number,
  localTimeS: number,
): number {
  const amount = Math.max(
    transitionAmountAt(transitionIn, "in", durationS, localTimeS),
    transitionAmountAt(transitionOut, "out", durationS, localTimeS),
  );
  return Math.max(0, Math.min(1, 1 - amount));
}
