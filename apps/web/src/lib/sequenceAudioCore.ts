import type { CueSheet, Segment } from "@cuesheet/schema";
import { cumulativeCutStarts } from "./bgmCutMapping.js";

/** A BGM ducking window, in OUTPUT time (seconds) - same shape as @cuesheet/render's DuckingWindow. */
export interface DuckingWindow {
  start: number;
  end: number;
}

/**
 * Ported (not imported) from @cuesheet/render's ducking.ts: importing @cuesheet/render's main
 * entry from client-bundled code pulls in title.ts's `node:crypto` import transitively (used for
 * a cache-key hash, server/CLI-only), which Vite externalizes for the browser and throws the
 * moment the module graph is evaluated - crashing the whole app on load. So this is a deliberate
 * small web-side mirror instead, kept in lockstep by hand with the original's logic/doc below.
 *
 * Derives BGM ducking windows (PRD backlog #4) from narration placements already in the cuesheet -
 * no per-cut ducking field exists, so this is the only source of windows. One raw window per
 * narrated segment: its cut's OUTPUT start time (cumulative sum of prior segments' (out-in)/speed,
 * matching exactly how buildRenderPlan places narration audio via adelay) extended by that
 * narration clip's own duration. narrationDurations is keyed by segment index; a narrated segment
 * with no matching entry can't contribute a window (skipped, not thrown).
 */
export function deriveDuckingWindows(
  cue: Pick<CueSheet, "segments" | "narration">,
  narrationDurations: Record<number, number> | undefined,
): { windows: DuckingWindow[] } {
  const raw: DuckingWindow[] = [];
  let segmentOffset = 0;
  cue.segments.forEach((s, i) => {
    if (cue.narration?.enabled && s.narration) {
      const durationS = narrationDurations?.[i];
      if (durationS != null && durationS > 0) {
        raw.push({ start: segmentOffset, end: segmentOffset + durationS });
      }
    }
    segmentOffset += (s.out - s.in) / s.speed;
  });
  return { windows: mergeDuckingWindows(raw) };
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

/** Per-BGM-track playback state at a given output-timeline position. */
export interface BgmAudioState {
  bgmIndex: number;
  file: string;
  shouldPlay: boolean;
  /** Seconds into the BGM file itself to seek to (position - track.start). */
  seekS: number;
  /** track.volume, already multiplied by the ducking gain (1 when ducking is off/not in a window). */
  volume: number;
}

/** Per-narrated-segment playback state at a given output-timeline position. */
export interface NarrationAudioState {
  segmentIndex: number;
  file: string;
  shouldPlay: boolean;
  /** Seconds into the narration file itself to seek to (position - segment's output start). */
  seekS: number;
  volume: number;
}

export interface AudioStates {
  bgm: BgmAudioState[];
  narration: NarrationAudioState[];
}

/**
 * Ducking gain (a 0-1 multiplier) at output time `t`, given merged non-overlapping windows - a
 * pure numeric mirror of @cuesheet/render's buildDuckingGainExpression (packages/render/src/ducking.ts),
 * which instead builds an ffmpeg `volume` filter expression string for the baked-in export. Same
 * ramp-down/hold/ramp-up shape: 1 outside every window, dips linearly to `1-amount` over `fadeS`
 * entering a window, holds at `1-amount` through the middle, ramps back to 1 over `fadeS` leaving.
 * Kept as a separate hand-written mirror (rather than parsing/evaluating the ffmpeg expression
 * string) since the two serve different consumers - an ffmpeg filtergraph vs. a live
 * HTMLAudioElement.volume you can just assign a plain number to every tick.
 */
export function duckingGainAt(
  windows: ReadonlyArray<{ start: number; end: number }>,
  amount: number,
  fadeS: number,
  t: number,
): number {
  if (windows.length === 0 || amount <= 0) {
    return 1;
  }
  const floor = 1 - amount;
  for (const w of windows) {
    if (t < w.start || t > w.end) {
      continue;
    }
    const len = w.end - w.start;
    // Same "don't let the ramp overshoot a short window" clamp as buildDuckingGainExpression.
    const f = Math.max(0.001, Math.min(fadeS, len / 2));
    if (t < w.start + f) {
      return 1 - amount * ((t - w.start) / f);
    }
    if (t < w.end - f) {
      return floor;
    }
    return floor + amount * ((t - (w.end - f)) / f);
  }
  return 1;
}

/**
 * Maps each narrated segment's index -> its narration clip's duration (seconds), looked up by
 * filename from the /api/narration-files listing (already fetched for the narration file picker -
 * reused here rather than adding a new endpoint). A segment whose narration filename isn't found
 * in the list is simply omitted; computeAudioStates below falls back to an approximation for it.
 */
export function buildNarrationDurations(
  segments: Segment[],
  narrationFiles: ReadonlyArray<{ name: string; durationS: number | null }>,
): Record<number, number> {
  const byName = new Map(narrationFiles.map((f) => [f.name, f.durationS]));
  const out: Record<number, number> = {};
  segments.forEach((s, i) => {
    if (!s.narration) {
      return;
    }
    const d = byName.get(s.narration);
    if (d != null) {
      out[i] = d;
    }
  });
  return out;
}

/**
 * Per-source playback state at output-timeline position `positionS` (the same seconds domain as
 * bgm.start/end, and SequencePlayer's own cumulative cut-start math via cumulativeCutStarts) -
 * the pure core the useSequenceAudio hook applies onto real HTMLAudioElements. Kept side-effect
 * free so every case (window boundaries, ducking multiply) is unit-testable without touching a
 * DOM/media element.
 */
export function computeAudioStates(
  cue: CueSheet,
  positionS: number,
  narrationDurations: Record<number, number> | undefined,
): AudioStates {
  const ducking = cue.narration?.ducking;
  // deriveDuckingWindows already gates internally on cue.narration?.enabled (returns no windows
  // when narration is off), matching @cuesheet/render's own `if (ducking) {...}` call site
  // (plan.ts) - so no separate narration.enabled check is needed here.
  const duckingWindows = ducking ? deriveDuckingWindows(cue, narrationDurations).windows : [];

  const bgm: BgmAudioState[] = cue.bgm.map((track, bgmIndex) => {
    const within = positionS >= track.start && positionS < track.end;
    const gain = ducking ? duckingGainAt(duckingWindows, ducking.amount, ducking.fadeS, positionS) : 1;
    return {
      bgmIndex,
      file: track.file,
      shouldPlay: within && track.file !== "",
      seekS: Math.max(0, positionS - track.start),
      volume: track.volume * gain,
    };
  });

  const narration: NarrationAudioState[] = [];
  if (cue.narration?.enabled) {
    const cumStart = cumulativeCutStarts(cue.segments);
    const narrationVolume = cue.narration.volume;
    cue.segments.forEach((seg, i) => {
      if (!seg.narration) {
        return;
      }
      const start = cumStart[i] ?? 0;
      // Fallback for when this narration clip's real duration isn't known yet (still probing, or
      // missing from the /api/narration-files listing): approximate the window as the segment's
      // own on-screen duration. Narration clips are usually authored to roughly match their cut's
      // length, so this is a reasonable stand-in until the real duration is available.
      const knownDuration = narrationDurations?.[i];
      const cutOwnDuration = (cumStart[i + 1] ?? start) - start;
      const end = start + (knownDuration ?? cutOwnDuration);
      narration.push({
        segmentIndex: i,
        file: seg.narration,
        shouldPlay: positionS >= start && positionS < end,
        seekS: Math.max(0, positionS - start),
        volume: narrationVolume,
      });
    });
  }

  return { bgm, narration };
}
