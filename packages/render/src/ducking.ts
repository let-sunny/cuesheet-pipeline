import type { CueSheet } from "@cuesheet/schema";
import { computeSegmentOutputTimings } from "./timeline.js";

/** A BGM ducking window, in OUTPUT time (seconds). */
export interface DuckingWindow {
  start: number;
  end: number;
}

/**
 * Derives BGM ducking windows (PRD backlog #4) from narration placements already in the
 * cuesheet - no per-cut ducking field exists, so this is the only source of windows. One raw
 * window per narrated segment: its cut's OUTPUT start time (computeSegmentOutputTimings -
 * matching exactly how buildRenderPlan places narration audio via adelay, and how a two-pass
 * render places title overlays - see timeline.ts) extended by that narration clip's own
 * duration. Reuses the same v1 constraint as narration placement itself: intro duration isn't
 * probed, so this offset doesn't account for an intro's length (pre-existing limitation, not
 * introduced here).
 *
 * narrationDurations is keyed by segment index (mirrors RenderPlanOptions.titleAssets) - the
 * caller (CLI/web server) ffprobes each narration file up front since buildRenderPlan itself
 * stays pure/sync. A narrated segment with no matching entry can't contribute a window; this
 * degrades gracefully (that window is simply skipped, not thrown - ducking is a nice-to-have
 * automation on top of narration, not a render-blocking requirement) and returns a warning
 * string for the caller to surface, mirroring the crop/sourceDimensions pattern elsewhere in
 * this package rather than title's throw-on-missing-asset pattern (a title literally cannot
 * render without its asset; a narration can render fine without a ducking window).
 *
 * Returned windows are merged (see mergeDuckingWindows) so two narrations placed back to back
 * produce a single continuous dip instead of a dip-raise-dip blip.
 */
export function deriveDuckingWindows(
  cue: CueSheet,
  narrationDurations: Record<number, number> | undefined,
): { windows: DuckingWindow[]; warnings: string[] } {
  const warnings: string[] = [];
  const raw: DuckingWindow[] = [];
  const timings = computeSegmentOutputTimings(cue);
  cue.segments.forEach((s, i) => {
    if (cue.narration?.enabled && s.narration) {
      const durationS = narrationDurations?.[i];
      if (durationS != null && durationS > 0) {
        const start = timings[i]!.startS;
        raw.push({ start, end: start + durationS });
      } else {
        warnings.push(
          `segments[${i}].narration: could not determine this narration clip's duration - ducking skipped for this cut`,
        );
      }
    }
  });
  return { windows: mergeDuckingWindows(raw), warnings };
}

/** Merges overlapping/touching windows (sorted by start) into non-overlapping spans. */
export function mergeDuckingWindows(windows: DuckingWindow[]): DuckingWindow[] {
  const sorted = [...windows].sort((a, b) => a.start - b.start);
  const merged: DuckingWindow[] = [];
  for (const w of sorted) {
    const last = merged.at(-1);
    if (last && w.start <= last.end) {
      last.end = Math.max(last.end, w.end);
    } else {
      merged.push({ ...w });
    }
  }
  return merged;
}

/** Trims trailing zeros from a fixed-precision number string (avoids float noise like 0.30000000000000004). */
function num(n: number): string {
  return Number(n.toFixed(6)).toString();
}

/**
 * Builds an ffmpeg `volume` filter gain expression (a function of `t`, the stream's own
 * timestamp in seconds - see plan.ts's call site for why that lines up with these windows'
 * output-time domain) that is 1 outside every window, ramps linearly down to `1-amount` over
 * `fadeS` on the way into a window, holds at `1-amount` for the window's sustained middle, and
 * ramps back up to 1 over `fadeS` on the way out. Sidechaincompress is overkill for windows
 * already known in advance (PRD backlog #4's design sketch) - an expression is deterministic and
 * gives identical output on every render.
 *
 * Returns null when there's nothing to duck (no windows, or amount is 0) - callers should fall
 * back to a plain constant volume in that case (byte-identical to the pre-ducking filter string,
 * a deliberate no-op passthrough for cuesheets that don't use this feature).
 *
 * fadeS is clamped per-window to half that window's own length, the same "don't let the ramp
 * overshoot a short span" pattern as applyTransition's `Math.min(transition.durationS,
 * outputDurationS)` in plan.ts - a very short narration clip still gets a full down-then-up dip
 * rather than a ramp that overshoots into the next window's territory.
 */
export function buildDuckingGainExpression(
  windows: DuckingWindow[],
  amount: number,
  fadeS: number,
): string | null {
  if (windows.length === 0 || amount <= 0) {
    return null;
  }
  const floor = 1 - amount;
  let expr = "1";
  // Each window wraps the accumulated expression as its "otherwise" branch - since windows are
  // non-overlapping (mergeDuckingWindows already guarantees this), evaluation order between them
  // doesn't matter, only that between(t,start,end) correctly gates each one.
  for (const w of windows) {
    const len = w.end - w.start;
    // Minimum bound avoids a literal /0 in the (pathological) case of a zero-length window.
    const f = Math.max(0.001, Math.min(fadeS, len / 2));
    const rampIn = `(1-(${num(amount)})*(t-${num(w.start)})/${num(f)})`;
    const rampOut = `(${num(floor)}+(${num(amount)})*(t-(${num(w.end - f)}))/${num(f)})`;
    const windowExpr = `if(lt(t,${num(w.start + f)}),${rampIn},if(lt(t,${num(w.end - f)}),${num(floor)},${rampOut}))`;
    expr = `if(between(t,${num(w.start)},${num(w.end)}),${windowExpr},${expr})`;
  }
  return expr;
}
