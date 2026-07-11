import type { BgmCue, CueSheet } from "@cuesheet/schema";
import { cumulativeCutStarts, cutRangeToSeconds } from "./bgmCutMapping.js";

/** Default span (in cuts) a freshly added BGM track covers, when there are enough cuts to fill it -
 * through cut 3 (index 2). Chosen so a new track is immediately visible/draggable without already
 * spanning the whole episode. */
export const DEFAULT_BGM_TRACK_SPAN_CUTS = 3;

/** Patches bgm cue i with patch, leaving every other cue untouched. */
export function updateBgmAt(cue: CueSheet, i: number, patch: Partial<BgmCue>): CueSheet {
  const bgm = cue.bgm.map((c, idx) => (idx === i ? { ...c, ...patch } : c));
  return { ...cue, bgm };
}

/**
 * Appends a new BGM track anchored at cut 1 (index 0) through DEFAULT_BGM_TRACK_SPAN_CUTS cuts (or
 * the last cut, whichever is shorter) - the gutter's "+ Add track" button's pure transformation.
 * Always anchors to the top of the list regardless of which cut happens to be selected (see the
 * doc on useEditStepActions's addBgmTrack for why).
 */
export function addBgmTrackToSheet(cue: CueSheet): { cue: CueSheet; newIndex: number } {
  const cumStart = cumulativeCutStarts(cue.segments);
  const lastCutIdx = cue.segments.length - 1;
  const endCutIdx = Math.min(lastCutIdx, DEFAULT_BGM_TRACK_SPAN_CUTS - 1);
  const { start, end } = cutRangeToSeconds(0, endCutIdx, cumStart);
  const newCue: BgmCue = { file: "", start, end, volume: 1 };
  return { cue: { ...cue, bgm: [...cue.bgm, newCue] }, newIndex: cue.bgm.length };
}

/** Moves/resizes bgm cue bgmIndex to span [startCutIdx, endCutIdx] (inclusive), converting back to seconds. */
export function changeBgmRangeInSheet(
  cue: CueSheet,
  bgmIndex: number,
  startCutIdx: number,
  endCutIdx: number,
): CueSheet {
  const cumStart = cumulativeCutStarts(cue.segments);
  const { start, end } = cutRangeToSeconds(startCutIdx, endCutIdx, cumStart);
  const bgm = cue.bgm.map((c, idx) => (idx === bgmIndex ? { ...c, start, end } : c));
  return { ...cue, bgm };
}

/** Removes bgm cue i. */
export function removeBgmTrackAt(cue: CueSheet, i: number): CueSheet {
  return { ...cue, bgm: cue.bgm.filter((_, idx) => idx !== i) };
}
