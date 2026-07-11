// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTitleFrameLoop } from "../../src/hooks/useTitleFrameLoop.js";

afterEach(cleanup);

describe("useTitleFrameLoop", () => {
  let pending: Map<number, FrameRequestCallback>;
  let nextId: number;
  let nowValue: number;

  // Full manual control over rAF + performance.now() - id-tracked (rather than a plain queue) so
  // a real `cancelAnimationFrame` call (as happens on every effect re-run - pause, restart, or a
  // prop change) actually removes the stale callback instead of leaving it to fire later with its
  // old, now-wrong closed-over anchor. Each `tick(now)` then simulates exactly one animation frame
  // firing at wall-clock time `now`, so the resulting frame value can be asserted deterministically
  // instead of racing a real timer.
  beforeEach(() => {
    pending = new Map();
    nextId = 0;
    nowValue = 0;
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((cb: FrameRequestCallback) => {
        nextId += 1;
        pending.set(nextId, cb);
        return nextId;
      }),
    );
    vi.stubGlobal(
      "cancelAnimationFrame",
      vi.fn((id: number) => {
        pending.delete(id);
      }),
    );
    vi.spyOn(performance, "now").mockImplementation(() => nowValue);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function tick(now: number) {
    nowValue = now;
    const [id, cb] = [...pending.entries()][0] ?? [undefined, undefined];
    if (id !== undefined) {
      pending.delete(id);
    }
    act(() => {
      cb?.(now);
    });
  }

  it("starts at frame 0 and advances proportionally to elapsed time while playing", () => {
    const { result } = renderHook(() => useTitleFrameLoop({ fps: 30, durationInFrames: 300, playing: true, restartToken: 0 }));
    expect(result.current.frame).toBe(0);

    tick(500); // 0.5s elapsed at 30fps -> frame 15
    expect(result.current.frame).toBe(15);

    tick(1000); // 1s elapsed -> frame 30
    expect(result.current.frame).toBe(30);
  });

  it("loops back to 0 once the frame count wraps past durationInFrames", () => {
    const { result } = renderHook(() => useTitleFrameLoop({ fps: 30, durationInFrames: 30, playing: true, restartToken: 0 }));
    tick(1000); // 1s elapsed * 30fps = frame 30, wraps to 0 within a 30-frame loop
    expect(result.current.frame).toBe(0);
  });

  it("stops scheduling further frames while paused", () => {
    const { rerender } = renderHook(
      ({ playing }) => useTitleFrameLoop({ fps: 30, durationInFrames: 300, playing, restartToken: 0 }),
      { initialProps: { playing: true } },
    );
    tick(500);
    rerender({ playing: false });
    expect(pending.size).toBe(0);
  });

  it("resumes from where it paused rather than restarting at 0", () => {
    const { result, rerender } = renderHook(
      ({ playing }) => useTitleFrameLoop({ fps: 30, durationInFrames: 300, playing, restartToken: 0 }),
      { initialProps: { playing: true } },
    );
    tick(500);
    expect(result.current.frame).toBe(15);

    rerender({ playing: false });
    rerender({ playing: true });
    tick(600);
    // If resuming re-anchored to "now" (restarting), this would be frame 3 (0.1s * 30fps) instead.
    expect(result.current.frame).toBe(18);
  });

  it("restart (a restartToken bump) snaps back to frame 0 even mid-playback", () => {
    const { result, rerender } = renderHook(
      ({ restartToken }) => useTitleFrameLoop({ fps: 30, durationInFrames: 300, playing: true, restartToken }),
      { initialProps: { restartToken: 0 } },
    );
    tick(500);
    expect(result.current.frame).toBe(15);

    rerender({ restartToken: 1 });
    expect(result.current.frame).toBe(0);

    tick(600);
    expect(result.current.frame).toBe(3); // 0.1s elapsed since the restart at (virtual) now=500
  });
});
