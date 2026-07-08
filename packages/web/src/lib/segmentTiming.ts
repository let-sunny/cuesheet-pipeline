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
  const m = Math.floor(safe / 60);
  const s = roundSeconds ? Math.round(safe % 60) : Math.floor(safe % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
