import type { CueSheet } from "@cuesheet/schema";

/**
 * Cross-clamps a cut's transitionIn/transitionOut durations against each other so they never
 * overlap: each is first clamped to outputDurationS individually (unchanged from before), then, if
 * their SUM still exceeds outputDurationS, both are scaled down proportionally (ratio preserved) so
 * dIn + dOut <= outputDurationS, floored at 0.1s each. Without this, e.g. a 1.5s cut with a 2s
 * transitionIn and a 2s transitionOut each independently clamp to 1.5s - the two fade/dip windows
 * then span the ENTIRE cut and overlap each other, compounding into a near-total blackout instead
 * of the intended in->hold->out envelope (reproduced via a real render, see plan.test.ts and
 * QA-2's transition_collision_strip.png). Shared by both the video side (applyTransition) and the
 * audio side (transitionAudioFilters) so the two stay in lockstep.
 */
export function clampTransitionDurations(
  transitionIn: CueSheet["segments"][number]["transitionIn"],
  transitionOut: CueSheet["segments"][number]["transitionOut"],
  outputDurationS: number,
): { dIn: number; dOut: number } {
  const MIN_S = 0.1;
  let dIn = transitionIn ? Math.min(transitionIn.durationS, outputDurationS) : 0;
  let dOut = transitionOut ? Math.min(transitionOut.durationS, outputDurationS) : 0;
  const sum = dIn + dOut;
  if (sum > outputDurationS && sum > 0) {
    const scale = outputDurationS / sum;
    if (transitionIn) dIn = Math.max(MIN_S, dIn * scale);
    if (transitionOut) dOut = Math.max(MIN_S, dOut * scale);
  }
  return { dIn, dOut };
}

/**
 * Video-side fade/dip at one edge of a cut (PRD backlog #3). Offsets are on the segment's own
 * OUTPUT timeline: "in" starts at st=0, "out" ends at st=outputDurationS (i.e. starts at
 * outputDurationS-d). d is the already cross-clamped duration for this side (see
 * clampTransitionDurations) rather than the raw transition.durationS, so a transitionIn+transitionOut
 * pair that would otherwise overlap on a short cut never produces overlapping fade windows.
 *
 * "fade" fades the whole composited frame (video+subtitle+title, since this runs last in the
 * per-clip video chain) directly to/from black via the plain `fade` filter - a single filter link.
 *
 * "dip" instead overlays a separate black layer whose alpha ramps 0<->dim (dim<1 = a partial dip
 * that never fully hides the frame) - the exact same alpha-overlay technique as the title backdrop
 * dim (`color=black,format=yuva420p,fade=...:alpha=1,colorchannelmixer=aa=<dim>` then `overlay`),
 * just windowed to the cut boundary instead of held for a title's whole duration:
 * - "in": alpha starts at dim (t=0) and fades OUT to 0 by t=d (`fade=t=out`), i.e. the cut
 *   opens fully dipped and reveals the footage.
 * - "out": alpha starts at 0 and fades IN to dim by the cut's end (`fade=t=in`), i.e. the footage
 *   is covered by the dip right before the cut ends.
 * Each side's own color layer spans the clip's whole outputDurationS so its alpha value is exactly
 * 0 outside its own transition window (no separate `enable` clause needed, unlike the title
 * backdrop which needs one because it shares the frame with non-title footage on either side).
 */
export function applyTransition(
  filters: string[],
  vLabel: string,
  i: number,
  side: "in" | "out",
  transition: NonNullable<CueSheet["segments"][number]["transitionIn"]>,
  d: number,
  outputDurationS: number,
  W: number,
  H: number,
  fps: number,
): string {
  const st = side === "in" ? 0 : outputDurationS - d;

  if (transition.type === "fade") {
    const label = `vtx${side}${i}`;
    filters.push(`[${vLabel}]fade=t=${side}:st=${st}:d=${d}[${label}]`);
    return label;
  }

  const dim = transition.dim ?? 1;
  const alphaFade = side === "in" ? `fade=t=out:st=0:d=${d}:alpha=1` : `fade=t=in:st=${st}:d=${d}:alpha=1`;
  const colorLabel = `dip${side}${i}`;
  filters.push(
    `color=black:size=${W}x${H}:duration=${outputDurationS}:rate=${fps},format=yuva420p,` +
      `${alphaFade},colorchannelmixer=aa=${dim}[${colorLabel}]`,
  );
  const label = `vdip${side}${i}`;
  filters.push(`[${vLabel}][${colorLabel}]overlay=0:0[${label}]`);
  return label;
}

/**
 * Audio-side fade for the same cut boundary transitions, regardless of type (fade/dip) - both get
 * a plain `afade` over the same [st, st+d] window as the video side (screen-spec/PRD: "audio afade
 * same windows"). dIn/dOut are the same cross-clamped durations passed to applyTransition (see
 * clampTransitionDurations) so the audio and video envelopes always agree. Returns filter fragments
 * meant to be appended to a clip's existing audio chain.
 */
export function transitionAudioFilters(
  transitionIn: CueSheet["segments"][number]["transitionIn"],
  transitionOut: CueSheet["segments"][number]["transitionOut"],
  dIn: number,
  dOut: number,
  outputDurationS: number,
): string[] {
  const parts: string[] = [];
  if (transitionIn) {
    parts.push(`afade=t=in:st=0:d=${dIn}`);
  }
  if (transitionOut) {
    parts.push(`afade=t=out:st=${outputDurationS - dOut}:d=${dOut}`);
  }
  return parts;
}
