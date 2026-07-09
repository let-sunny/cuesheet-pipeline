import { useEffect, useRef } from "react";
import { useToast } from "@astryxdesign/core/Toast";
import type { CueSheet } from "@cuesheet/schema";
import { bgmFileStreamUrl, narrationFileUrl } from "../api.js";
import type { NarrationFile } from "../api.js";
import { buildNarrationDurations, computeAudioStates } from "../lib/sequenceAudioCore.js";

export interface UseSequenceAudioOptions {
  /** The full cuesheet (needs bgm/narration alongside segments — SequencePlayer's own `segments`
   *  prop alone isn't enough to derive ducking windows or narration file/volume). */
  cue: CueSheet;
  /** Current position on the *output* timeline (seconds) — same basis SequencePlayer already
   *  computes via computeCurrentOutputPosition, the single source of truth for this hook's clock. */
  positionS: number;
  playing: boolean;
  /** SequencePlayer's user-selected playback speed (1x/1.5x/2x). Unlike a segment's own video
   *  speed, BGM/narration tracks already live on the output timeline, so this is the only rate
   *  multiplier that applies to them. */
  rate: number;
  /** /api/narration-files listing (already fetched in App.tsx for the narration file picker) —
   *  reused here to look up each narrated segment's real clip duration by filename. */
  narrationFiles: NarrationFile[];
}

/** Only force a resync seek once drift exceeds this (seconds) — small jitter from the
 *  position clock updating a few times a second shouldn't cause audible seek-stutter. */
const DRIFT_THRESHOLD_S = 0.25;
/** HTMLMediaElement.playbackRate's practical floor across browsers. */
const MIN_RATE = 0.0625;
/** Mirrors SequencePlayer's MAX_PLAYBACK_RATE (schema also caps segment.speed at 16). */
const MAX_RATE = 16;

function clampRate(rate: number): number {
  return Math.min(MAX_RATE, Math.max(MIN_RATE, rate));
}

interface ManagedAudio {
  audio: HTMLAudioElement;
  loadedFile: string | null;
  /** Set once `loadedFile` fails to load/decode (e.g. the file was deleted or the path is stale) -
   *  applyState skips retrying play() for this exact file (an unconditional retry every tick,
   *  since this hook's effect has no dependency array, would otherwise spin forever) until a
   *  *different* file is requested for this track. */
  failedFile: string | null;
  /** Whether the one-per-track toast for the current `failedFile` has already been shown. */
  toastShown: boolean;
}

/** Creates a hidden audio element and attaches it to the document body — playback works fine
 *  fully detached, but attaching it (a) matches how other apps park background media elements and
 *  (b) makes it findable via `audio[data-sequence-audio="..."]` from devtools/e2e checks instead
 *  of only reachable through this hook's internal refs. Also wires an `error` listener that marks
 *  the currently-loading file as failed (see ManagedAudio.failedFile) so a missing/broken file
 *  stops being retried instead of erroring on every tick. */
function createManagedAudio(tag: string): ManagedAudio {
  const audio = new Audio();
  audio.dataset.sequenceAudio = tag;
  audio.style.display = "none";
  document.body.appendChild(audio);
  const managed: ManagedAudio = { audio, loadedFile: null, failedFile: null, toastShown: false };
  audio.addEventListener("error", () => {
    managed.failedFile = managed.loadedFile;
  });
  return managed;
}

function getOrCreateManaged(map: Map<number, ManagedAudio>, index: number): ManagedAudio {
  let managed = map.get(index);
  if (!managed) {
    managed = createManagedAudio(`bgm-${index}`);
    map.set(index, managed);
  }
  return managed;
}

function teardown(managed: ManagedAudio): void {
  managed.audio.pause();
  managed.audio.src = "";
  managed.audio.remove();
}

/** Applies one computed state onto a real audio element: (re)loads its src on a file change, then
 *  either plays (seeking on first play, or resyncing when drift exceeds DRIFT_THRESHOLD_S) or
 *  pauses (also skipping play() once `managed.failedFile` matches the current file). Doesn't show
 *  the missing-file toast itself (kept a pure-ish DOM operation, no toast dependency, easier to
 *  reason about/test) - the caller checks `managed.failedFile`/`toastShown` after calling this. */
function applyState(
  managed: ManagedAudio,
  args: { file: string; srcUrl: string; shouldPlay: boolean; seekS: number; volume: number; rate: number },
): void {
  const { audio } = managed;
  if (managed.loadedFile !== args.file) {
    audio.pause();
    audio.src = args.srcUrl;
    managed.loadedFile = args.file;
    // A different file than the one that previously failed - give it a fresh chance/toast budget.
    if (managed.failedFile !== args.file) {
      managed.failedFile = null;
      managed.toastShown = false;
    }
  }
  audio.volume = Math.min(1, Math.max(0, args.volume));
  audio.playbackRate = args.rate;

  if (!args.shouldPlay || managed.failedFile === args.file) {
    if (!audio.paused) {
      audio.pause();
    }
    return;
  }

  if (audio.paused) {
    audio.currentTime = Math.max(0, args.seekS);
    void audio.play().catch(() => {});
    return;
  }
  if (Math.abs(audio.currentTime - args.seekS) > DRIFT_THRESHOLD_S) {
    audio.currentTime = Math.max(0, args.seekS);
  }
}

/**
 * Manages real HTMLAudioElement instances (created detached from the DOM — playback works fine
 * without attaching them) for every BGM track plus the currently-active narration clip, driven by
 * the pure computeAudioStates core. This is what makes "Play all" actually audible for BGM and
 * narration (and lets BGM ducking be heard) instead of only playing the selected cut's own
 * embedded video/audio track, which is all SequencePlayer's <video> elements provide on their own.
 *
 * Narration is modeled with a single shared element rather than one-per-segment: segments are
 * sequential/non-overlapping (the cuesheet's editing grammar - see CLAUDE.md), so at most one
 * narration clip is ever active at a time; its file just gets swapped when the active segment
 * changes. BGM tracks can legitimately overlap (the BGM gutter's lanes), so those get one element
 * per track index instead.
 */
export function useSequenceAudio({ cue, positionS, playing, rate, narrationFiles }: UseSequenceAudioOptions): void {
  const toast = useToast();
  const bgmAudiosRef = useRef<Map<number, ManagedAudio>>(new Map());
  const narrationAudioRef = useRef<ManagedAudio | null>(null);

  // One toast per track per failed file (not per tick) - fires the first time this render's
  // applyState call left a track newly marked failed.
  function toastIfNewlyFailed(managed: ManagedAudio, label: string): void {
    if (managed.failedFile && !managed.toastShown) {
      managed.toastShown = true;
      toast({ type: "error", body: `${label}: couldn't play "${managed.failedFile}" - skipping it.` });
    }
  }

  // Mount/unmount only - tears down every managed element so nothing keeps playing after
  // SequencePlayer itself is torn down (e.g. its "Close" button).
  useEffect(() => {
    const bgmAudios = bgmAudiosRef.current;
    return () => {
      bgmAudios.forEach(teardown);
      bgmAudios.clear();
      if (narrationAudioRef.current) {
        teardown(narrationAudioRef.current);
        narrationAudioRef.current = null;
      }
    };
  }, []);

  // Deliberately has no dependency array: SequencePlayer's clock (positionS) updates via a
  // `timeupdate`-driven React state a few times a second, and this effect needs to resync audio
  // on every one of those ticks (as well as on playing/rate/cue changes) - recomputing states is
  // cheap (a handful of small array maps), so re-running on every render is the simplest way to
  // stay in lockstep with "SequencePlayer's clock is the source of truth."
  useEffect(() => {
    const narrationDurations = buildNarrationDurations(cue.segments, narrationFiles);
    const states = computeAudioStates(cue, positionS, narrationDurations);
    const clampedRate = clampRate(rate);

    const seenIndices = new Set<number>();
    for (const state of states.bgm) {
      seenIndices.add(state.bgmIndex);
      const managed = getOrCreateManaged(bgmAudiosRef.current, state.bgmIndex);
      applyState(managed, {
        file: state.file,
        srcUrl: bgmFileStreamUrl(state.file),
        shouldPlay: playing && state.shouldPlay,
        seekS: state.seekS,
        volume: state.volume,
        rate: clampedRate,
      });
      toastIfNewlyFailed(managed, `Background music track ${state.bgmIndex + 1}`);
    }
    // Drop/pause elements for BGM tracks that no longer exist (e.g. a track was removed mid-playback).
    for (const [index, managed] of bgmAudiosRef.current) {
      if (!seenIndices.has(index)) {
        teardown(managed);
        bgmAudiosRef.current.delete(index);
      }
    }

    const activeNarration = states.narration.find((n) => n.shouldPlay);
    if (activeNarration && cue.narration?.enabled) {
      const managed = narrationAudioRef.current ?? createManagedAudio("narration");
      narrationAudioRef.current = managed;
      applyState(managed, {
        file: activeNarration.file,
        srcUrl: narrationFileUrl(activeNarration.file, cue.narration.dir),
        shouldPlay: playing,
        seekS: activeNarration.seekS,
        volume: activeNarration.volume,
        rate: clampedRate,
      });
      toastIfNewlyFailed(managed, "Narration");
    } else if (narrationAudioRef.current && !narrationAudioRef.current.audio.paused) {
      narrationAudioRef.current.audio.pause();
    }
  });
}
