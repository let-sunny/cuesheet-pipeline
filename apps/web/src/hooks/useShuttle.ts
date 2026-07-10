import { useEffect, useRef } from "react";

/** The subset of a segment's playback-affecting fields the shuttle needs to respect. */
export interface ShuttleBounds {
  in: number;
  out: number;
  speed: number;
  volume: number;
}

export interface UseShuttleOptions {
  /** Returns the `<video>` element currently under shuttle control. A function (not a plain ref)
      so callers with slot indirection (SequencePlayer swaps between two preloaded `<video>`s) can
      always resolve the *current* active element, including from inside the reverse-playback rAF
      loop where a stale ref would keep driving the wrong slot after a swap. */
  getVideo: () => HTMLVideoElement | null;
  /** The cut currently loaded — shuttling only makes sense within its bounds. `undefined` makes
      shuttleForward/shuttleBackward no-ops (mirrors "no segment selected"). */
  bounds: ShuttleBounds | undefined;
  setCurrentTime: (t: number) => void;
  /** Reverse playback's floor (seconds). Defaults to `bounds.in`. SequencePlayer intentionally
      floors at 0 (the clip's absolute start) instead of the cut's `in` — its `<video>` holds the
      whole source clip rather than being scoped to the segment, and reverse there is allowed to
      run back past the cut boundary into the same clip's earlier footage. */
  reverseFloor?: number;
  /** Whether starting forward shuttle while positioned outside `[bounds.in, bounds.out)` snaps
      back to `bounds.in` first. Defaults to true (VideoPreview's original behavior, needed since
      its scrub strip can seek anywhere in the full clip). SequencePlayer opts out (`false`) since
      its cut-change effect already guarantees the position is in-bounds before shuttling starts. */
  snapToInOnForwardStart?: boolean;
  /** Extra side effect run whenever the shuttle resets to "stopped" (in addition to the built-in
      `muted = false`) — fires from `resetShuttle` itself, so also from every path that calls it
      (togglePlay, cut changes, shuttleStop). SequencePlayer uses this to restore `playbackRate` to
      `segment.speed * userRate`; VideoPreview doesn't need it. */
  onReset?: () => void;
  /** Extra side effect run whenever the shuttle actually stops (both an explicit `shuttleStop()`
      call and reverse playback hitting its floor on its own) — unlike `onReset`, this does NOT
      fire for a plain reset that isn't also a stop (e.g. a cut change while nothing was shuttling).
      SequencePlayer uses this to clear its own `playing` state. */
  onStop?: () => void;
  /** Extra side effect run only when reverse shuttle *starts* (not on repeated J presses that just
      bump the speed level). SequencePlayer uses this to clear its own `playing` state immediately. */
  onBackwardStart?: () => void;
}

export interface UseShuttleResult {
  /** L: forward playback. Repeated presses raise the speed 1x -> 2x -> 4x (capped at 4x). If
      reverse playback is active, switches to forward 1x. */
  shuttleForward: () => void;
  /** J: reverse playback (approximate, HTML video has no negative playbackRate). Repeated
      presses raise the speed 1x -> 2x -> 4x. Audio is meaningless here so it's muted. If forward
      playback is active, switches to reverse 1x. */
  shuttleBackward: () => void;
  /** K: stop shuttle and pause. */
  shuttleStop: () => void;
  /** Resets the shuttle state back to normal (stopped) without pausing - used when starting a
      regular (non-shuttle) play, or when the selected cut changes. */
  resetShuttle: () => void;
}

/**
 * The J/K/L "shuttle" (speed ladder + approximate reverse playback) shared by VideoPreview's
 * per-cut trim view and SequencePlayer's full-playthrough view. HTML video has no negative
 * playbackRate, so reverse playback is approximated by pausing and decrementing currentTime
 * directly on a requestAnimationFrame loop. The two consumers differ in how the active `<video>`
 * is resolved (a single stable ref vs. a preload-slot indirection) and in a few bookkeeping details
 * (reverse floor, forward-start snap, extra state to sync on reset/stop) — see each option's doc.
 */
export function useShuttle({
  getVideo,
  bounds,
  setCurrentTime,
  reverseFloor,
  snapToInOnForwardStart = true,
  onReset,
  onStop,
  onBackwardStart,
}: UseShuttleOptions): UseShuttleResult {
  // "stopped" means the shuttle isn't involved, i.e. normal playback/pause state (handled by
  // existing logic like handlePlay). Managed as refs only, since playback direction/speed don't
  // need to trigger a re-render.
  const shuttleDirectionRef = useRef<"stopped" | "forward" | "backward">("stopped");
  const shuttleLevelRef = useRef(1);
  const shuttleRafRef = useRef<number | null>(null);
  const shuttleLastTsRef = useRef<number | undefined>(undefined);

  const stopShuttleRaf = () => {
    if (shuttleRafRef.current !== null) {
      cancelAnimationFrame(shuttleRafRef.current);
      shuttleRafRef.current = null;
    }
  };

  const resetShuttle = () => {
    stopShuttleRaf();
    shuttleDirectionRef.current = "stopped";
    shuttleLevelRef.current = 1;
    const video = getVideo();
    if (video) {
      video.muted = false;
    }
    onReset?.();
  };

  const shuttleStop = () => {
    const video = getVideo();
    resetShuttle();
    if (video) {
      video.pause();
    }
    onStop?.();
  };

  /** Reverse playback frame loop — keeps video paused and decrements currentTime directly on
      every rAF (an approximation, since HTML video doesn't support negative playbackRate). */
  const reverseTick = (ts: number) => {
    const video = getVideo();
    if (!video || !bounds || shuttleDirectionRef.current !== "backward") {
      stopShuttleRaf();
      return;
    }
    const last = shuttleLastTsRef.current;
    shuttleLastTsRef.current = ts;
    if (last === undefined) {
      shuttleRafRef.current = requestAnimationFrame(reverseTick);
      return;
    }
    const dt = (ts - last) / 1000;
    const floor = reverseFloor ?? bounds.in;
    const next = Math.max(floor, video.currentTime - dt * shuttleLevelRef.current);
    video.currentTime = next;
    setCurrentTime(next);
    if (next <= floor) {
      shuttleStop();
      return;
    }
    shuttleRafRef.current = requestAnimationFrame(reverseTick);
  };

  const shuttleForward = () => {
    const video = getVideo();
    if (!video || !bounds) {
      return;
    }
    if (shuttleDirectionRef.current === "forward") {
      shuttleLevelRef.current = nextShuttleLevel(shuttleLevelRef.current);
    } else {
      stopShuttleRaf();
      shuttleDirectionRef.current = "forward";
      shuttleLevelRef.current = 1;
      video.muted = false;
      if (snapToInOnForwardStart && (video.currentTime < bounds.in || video.currentTime >= bounds.out)) {
        video.currentTime = bounds.in;
        setCurrentTime(bounds.in);
      }
    }
    video.playbackRate = Math.min(bounds.speed * shuttleLevelRef.current, MAX_PLAYBACK_RATE);
    video.volume = bounds.volume;
    void video.play().catch(() => {});
  };

  const shuttleBackward = () => {
    const video = getVideo();
    if (!video || !bounds) {
      return;
    }
    if (shuttleDirectionRef.current === "backward") {
      shuttleLevelRef.current = nextShuttleLevel(shuttleLevelRef.current);
      return;
    }
    video.pause();
    shuttleDirectionRef.current = "backward";
    shuttleLevelRef.current = 1;
    video.muted = true;
    stopShuttleRaf();
    shuttleLastTsRef.current = undefined;
    shuttleRafRef.current = requestAnimationFrame(reverseTick);
    onBackwardStart?.();
  };

  // Clean up on unmount so no reverse-playback rAF loop is left running.
  useEffect(() => {
    return () => {
      stopShuttleRaf();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { shuttleForward, shuttleBackward, shuttleStop, resetShuttle };
}

/** The J/K/L shuttle's speed ladder: 1x -> 2x -> 4x, capped at 4x on further presses. */
export function nextShuttleLevel(level: number): number {
  return level >= 4 ? 4 : level * 2;
}

/** Browsers throw a NotSupportedError setting HTMLMediaElement.playbackRate above 16 - the schema
 * also caps segment.speed at 16, but this is a defensive clamp for old/hand-edited data (e.g. via
 * the bridge) and the J/K/L shuttle, which multiplies speed further (up to 4x). Exported since
 * both VideoPreview and SequencePlayer also apply it outside the shuttle. */
export const MAX_PLAYBACK_RATE = 16;
