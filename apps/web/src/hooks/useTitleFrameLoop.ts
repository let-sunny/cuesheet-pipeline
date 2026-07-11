import { useEffect, useRef, useState } from "react";

export interface UseTitleFrameLoopOptions {
  fps: number;
  /** Loop length - the frame counter wraps back to 0 once it reaches this. */
  durationInFrames: number;
  /** Pausing stops the rAF loop outright rather than merely freezing the displayed value, so no
   * background work happens while paused. */
  playing: boolean;
  /** Bump this (e.g. an incrementing counter owned by the caller) to reset playback to frame 0 -
   * a plain-prop stand-in for @remotion/player's old `seekTo(0)` ref method. Comparing against
   * the previous render's value (rather than just "on mount") is what makes every bump restart,
   * not just the first. */
  restartToken: number;
}

export interface UseTitleFrameLoopResult {
  frame: number;
}

/**
 * Drives a title-card preview's frame counter from real elapsed time (via requestAnimationFrame +
 * performance.now()) instead of a Remotion composition context - this is the replacement for
 * @remotion/player, which repeatedly failed to reliably start/advance its own internal frame
 * context in this Vite+workspace environment (crash, frozen at frame 0, and a real-browser freeze
 * even with an explicit play() nudge - see docs/goals for the full history). `spring`/`interpolate`
 * are pure functions, so a plain `frame` number driven by this hook produces the exact same
 * animation math as the real render, with zero Remotion runtime needed in the browser.
 *
 * Anchors the loop's start time to "now minus however many seconds the current frame represents",
 * so pausing and resuming continues from where it left off rather than jumping - only an explicit
 * restartToken bump snaps back to frame 0.
 */
export function useTitleFrameLoop({ fps, durationInFrames, playing, restartToken }: UseTitleFrameLoopOptions): UseTitleFrameLoopResult {
  const [frame, setFrame] = useState(0);
  const frameRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const prevRestartToken = useRef(restartToken);

  useEffect(() => {
    if (prevRestartToken.current !== restartToken) {
      prevRestartToken.current = restartToken;
      frameRef.current = 0;
      setFrame(0);
    }
  }, [restartToken]);

  useEffect(() => {
    if (!playing) {
      return;
    }
    const anchor = performance.now() - (frameRef.current / fps) * 1000;
    const tick = (now: number) => {
      const elapsedS = (now - anchor) / 1000;
      const next = Math.floor(elapsedS * fps) % durationInFrames;
      frameRef.current = next;
      setFrame(next);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
    // restartToken is intentionally a dependency here too: a restart while already playing must
    // cancel the in-flight rAF loop and re-anchor from the just-reset frameRef (0), not keep
    // ticking from the old anchor.
  }, [playing, fps, durationInFrames, restartToken]);

  return { frame };
}
