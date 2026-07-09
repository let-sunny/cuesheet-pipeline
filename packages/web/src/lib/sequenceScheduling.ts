import type { Segment } from "@cuesheet/schema";
import { playbackSeconds } from "./segmentTiming.js";

export interface ProgressClickTarget {
  index: number;
  /** Source-clip time (seconds) to seek the target cut's video element to. */
  sourceTime: number;
}

/**
 * Which of the two video slots (the dual-buffer swap SequencePlayer uses to preload the next
 * clip ahead of time) should become active for `clip`: stays on the current front slot if it
 * already holds that clip, swaps to the back slot if that one holds it instead, and otherwise
 * falls back to reusing the front slot (it'll load `clip` into it).
 */
export function pickActiveSlot(clipOfSlot: readonly [string | null, string | null], oldFront: 0 | 1, clip: string): 0 | 1 {
  if (clipOfSlot[oldFront] === clip) {
    return oldFront;
  }
  const back = oldFront === 0 ? 1 : 0;
  if (clipOfSlot[back] === clip) {
    return back;
  }
  return oldFront;
}

/**
 * Whether the idle (non-active) slot should start preloading `nextClip` ahead of time - only
 * when it isn't already sitting in either slot. Returns the idle slot index to load into, or
 * null if no preload is needed (already loaded, or there's no next cut).
 */
export function pickPreloadSlot(
  clipOfSlot: readonly [string | null, string | null],
  activeSlot: 0 | 1,
  nextClip: string | undefined,
): 0 | 1 | null {
  if (!nextClip) {
    return null;
  }
  const idleSlot = activeSlot === 0 ? 1 : 0;
  if (clipOfSlot[idleSlot] === nextClip || clipOfSlot[activeSlot] === nextClip) {
    return null;
  }
  return idleSlot;
}

/**
 * The current position (seconds) on the *output* timeline - cumStart[currentIndex] (the current
 * cut's own start) plus how far playback has advanced into it, converted from source time to
 * output time via the cut's speed. Falls back to the total (playback has run off the end) when
 * there's no current segment.
 */
export function computeCurrentOutputPosition(
  cumStart: number[],
  currentIndex: number,
  currentSegment: Segment | undefined,
  videoNow: number,
  totalOutputSeconds: number,
): number {
  if (!currentSegment) {
    return totalOutputSeconds;
  }
  const start = cumStart[currentIndex] ?? 0;
  return start + Math.max(0, videoNow - currentSegment.in) / currentSegment.speed;
}

/**
 * Progress-bar-click seek: maps a click ratio (0-1 across the whole output timeline) to the cut
 * it falls in, plus the source-clip time within that cut to seek to. Returns null when there's
 * nothing to seek to (no segments, or a zero-length output).
 */
export function resolveProgressClickTarget(
  segments: Segment[],
  cumStart: number[],
  totalOutputSeconds: number,
  ratio: number,
): ProgressClickTarget | null {
  if (totalOutputSeconds <= 0 || segments.length === 0) {
    return null;
  }
  const clampedRatio = Math.min(1, Math.max(0, ratio));
  const targetOutput = clampedRatio * totalOutputSeconds;

  let targetIndex = segments.length - 1;
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    if (!seg) {
      continue;
    }
    const start = cumStart[i] ?? 0;
    if (targetOutput < start + playbackSeconds(seg)) {
      targetIndex = i;
      break;
    }
  }
  const targetSeg = segments[targetIndex];
  if (!targetSeg) {
    return null;
  }
  const offsetOutput = Math.max(0, targetOutput - (cumStart[targetIndex] ?? 0));
  const sourceTime = Math.min(targetSeg.out, targetSeg.in + offsetOutput * targetSeg.speed);
  return { index: targetIndex, sourceTime };
}
