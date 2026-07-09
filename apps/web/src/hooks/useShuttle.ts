import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import type { Segment } from "@cuesheet/schema";

export interface UseShuttleOptions {
  videoRef: RefObject<HTMLVideoElement | null>;
  /** The cut currently loaded into `videoRef` - shuttling only makes sense within its in/out range. */
  segment: Segment | undefined;
  setCurrentTime: (t: number) => void;
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
 * per-cut trim view. HTML video has no negative playbackRate, so reverse playback is approximated
 * by pausing and decrementing currentTime directly on a requestAnimationFrame loop.
 */
export function useShuttle({ videoRef, segment, setCurrentTime }: UseShuttleOptions): UseShuttleResult {
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
    const video = videoRef.current;
    if (video) {
      video.muted = false;
    }
  };

  const shuttleStop = () => {
    const video = videoRef.current;
    resetShuttle();
    if (video) {
      video.pause();
    }
  };

  /** Reverse playback frame loop — keeps video paused and decrements currentTime directly on
      every rAF (an approximation, since HTML video doesn't support negative playbackRate). */
  const reverseTick = (ts: number) => {
    const video = videoRef.current;
    if (!video || !segment || shuttleDirectionRef.current !== "backward") {
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
    const next = Math.max(segment.in, video.currentTime - dt * shuttleLevelRef.current);
    video.currentTime = next;
    setCurrentTime(next);
    if (next <= segment.in) {
      shuttleStop();
      return;
    }
    shuttleRafRef.current = requestAnimationFrame(reverseTick);
  };

  const shuttleForward = () => {
    const video = videoRef.current;
    if (!video || !segment) {
      return;
    }
    if (shuttleDirectionRef.current === "forward") {
      shuttleLevelRef.current = nextShuttleLevel(shuttleLevelRef.current);
    } else {
      stopShuttleRaf();
      shuttleDirectionRef.current = "forward";
      shuttleLevelRef.current = 1;
      video.muted = false;
      if (video.currentTime < segment.in || video.currentTime >= segment.out) {
        video.currentTime = segment.in;
        setCurrentTime(segment.in);
      }
    }
    video.playbackRate = Math.min(segment.speed * shuttleLevelRef.current, MAX_PLAYBACK_RATE);
    video.volume = segment.volume;
    void video.play();
  };

  const shuttleBackward = () => {
    const video = videoRef.current;
    if (!video || !segment) {
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
 * VideoPreview also applies it outside the shuttle (handlePlay, the loadedmetadata effect). */
export const MAX_PLAYBACK_RATE = 16;
