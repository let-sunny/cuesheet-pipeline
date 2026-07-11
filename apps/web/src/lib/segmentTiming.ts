import type { Segment } from "@cuesheet/schema";

/** A segment's playback duration (seconds) on the output timeline. Shorter the faster the speed. */
export function playbackSeconds(seg: Segment): number {
  return (seg.out - seg.in) / seg.speed;
}

/**
 * Formats a duration in seconds as m:ss. Guards against NaN/negative input (treated as 0).
 * roundSeconds: whether the seconds part is rounded (true, for a static total) or floored
 * (false, the default — matches a live playhead clock that shouldn't visually jump ahead of
 * the actual playback position).
 */
export function formatClock(totalSeconds: number, roundSeconds = false): string {
  const safe = Number.isFinite(totalSeconds) && totalSeconds > 0 ? totalSeconds : 0;
  // Reduce to a whole-second count FIRST, then split into m:s - rounding the minutes and seconds
  // components independently would let a rounded-up 60s land as "0:60" instead of carrying into the
  // minutes digit ("1:00").
  const whole = roundSeconds ? Math.round(safe) : Math.floor(safe);
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
