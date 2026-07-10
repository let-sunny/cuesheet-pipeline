// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_PLAYBACK_RATE, nextShuttleLevel, useShuttle } from "../../src/hooks/useShuttle.js";
import type { ShuttleBounds, UseShuttleOptions } from "../../src/hooks/useShuttle.js";

afterEach(cleanup);

describe("nextShuttleLevel", () => {
  it("doubles 1 -> 2 -> 4, then caps at 4", () => {
    expect(nextShuttleLevel(1)).toBe(2);
    expect(nextShuttleLevel(2)).toBe(4);
    expect(nextShuttleLevel(4)).toBe(4);
    expect(nextShuttleLevel(8)).toBe(4);
  });
});

function makeBounds(overrides: Partial<ShuttleBounds> = {}): ShuttleBounds {
  return { in: 2, out: 10, speed: 1, volume: 0.8, ...overrides };
}

function makeFakeVideo() {
  return {
    currentTime: 0,
    playbackRate: 1,
    volume: 1,
    muted: false,
    paused: true,
    play: vi.fn(function (this: { paused: boolean }) {
      this.paused = false;
      return Promise.resolve();
    }),
    pause: vi.fn(function (this: { paused: boolean }) {
      this.paused = true;
    }),
  } as unknown as HTMLVideoElement & { play: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn> };
}

/** VideoPreview's own call shape: a single stable video, default reverse floor/snap. */
function renderVideoPreviewStyle(video: HTMLVideoElement, options: Partial<UseShuttleOptions> = {}) {
  const setCurrentTime = vi.fn();
  const bounds = options.bounds !== undefined ? options.bounds : makeBounds();
  const { result } = renderHook(() =>
    useShuttle({ getVideo: () => video, bounds, setCurrentTime, ...options }),
  );
  return { result, setCurrentTime };
}

describe("useShuttle", () => {
  let rafCallbacks: FrameRequestCallback[];

  beforeEach(() => {
    rafCallbacks = [];
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((cb: FrameRequestCallback) => {
        rafCallbacks.push(cb);
        return rafCallbacks.length;
      }),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shuttleForward is a no-op with no video/bounds", () => {
    const setCurrentTime = vi.fn();
    const { result } = renderHook(() => useShuttle({ getVideo: () => null, bounds: undefined, setCurrentTime }));
    result.current.shuttleForward();
    expect(setCurrentTime).not.toHaveBeenCalled();
  });

  it("shuttleForward starts at 1x, doubles on repeated presses, caps at 4x", () => {
    const video = makeFakeVideo();
    const { result } = renderVideoPreviewStyle(video, { bounds: makeBounds({ speed: 2 }) });

    result.current.shuttleForward();
    expect(video.playbackRate).toBe(2); // speed(2) * level(1)
    expect(video.play).toHaveBeenCalledOnce();

    result.current.shuttleForward();
    expect(video.playbackRate).toBe(4); // speed(2) * level(2)

    result.current.shuttleForward();
    expect(video.playbackRate).toBe(8); // speed(2) * level(4), capped ladder but not playbackRate itself

    result.current.shuttleForward();
    expect(video.playbackRate).toBe(8); // level stays capped at 4
  });

  it("clamps playbackRate at MAX_PLAYBACK_RATE for a fast segment", () => {
    const video = makeFakeVideo();
    const { result } = renderVideoPreviewStyle(video, { bounds: makeBounds({ speed: 8 }) });
    result.current.shuttleForward();
    result.current.shuttleForward(); // level 2 -> 16
    result.current.shuttleForward(); // level 4 -> 32, clamps
    expect(video.playbackRate).toBe(MAX_PLAYBACK_RATE);
  });

  it("shuttleForward resets to bounds.in when currentTime is outside [in, out) by default (VideoPreview's behavior)", () => {
    const video = makeFakeVideo();
    video.currentTime = 99; // outside [2, 10]
    const { result, setCurrentTime } = renderVideoPreviewStyle(video);

    result.current.shuttleForward();
    expect(video.currentTime).toBe(2);
    expect(setCurrentTime).toHaveBeenCalledWith(2);
  });

  it("does not snap to bounds.in when snapToInOnForwardStart is false (SequencePlayer's behavior)", () => {
    const video = makeFakeVideo();
    video.currentTime = 99;
    const { result, setCurrentTime } = renderVideoPreviewStyle(video, { snapToInOnForwardStart: false });

    result.current.shuttleForward();
    expect(video.currentTime).toBe(99);
    expect(setCurrentTime).not.toHaveBeenCalled();
  });

  it("shuttleBackward pauses, mutes, and switching from forward resets to reverse 1x", () => {
    const video = makeFakeVideo();
    const { result } = renderVideoPreviewStyle(video);

    result.current.shuttleForward();
    expect(video.muted).toBe(false);

    result.current.shuttleBackward();
    expect(video.pause).toHaveBeenCalled();
    expect(video.muted).toBe(true);
    expect(rafCallbacks.length).toBe(1); // reverseTick scheduled
  });

  it("the reverse-playback rAF loop decrements currentTime and stops at bounds.in by default", () => {
    const video = makeFakeVideo();
    video.currentTime = 5;
    const { result, setCurrentTime } = renderVideoPreviewStyle(video, { bounds: makeBounds({ in: 2, out: 10 }) });

    result.current.shuttleBackward();
    // First frame just establishes the timestamp baseline (no `last` yet).
    rafCallbacks[0]?.(1000);
    expect(rafCallbacks.length).toBe(2);
    // Second frame: dt=0.5s at level 1 -> currentTime decreases by 0.5.
    rafCallbacks[1]?.(1500);
    expect(video.currentTime).toBeCloseTo(4.5, 6);
    expect(setCurrentTime).toHaveBeenCalledWith(4.5);

    // Fast-forward far enough to hit the in-point floor.
    rafCallbacks[2]?.(10000);
    expect(video.currentTime).toBe(2); // clamped to bounds.in
    expect(video.pause).toHaveBeenCalled(); // shuttleStop() fired once the floor was reached
  });

  it("honors a custom reverseFloor instead of bounds.in (SequencePlayer floors at 0)", () => {
    const video = makeFakeVideo();
    video.currentTime = 0.5;
    const { result } = renderVideoPreviewStyle(video, { bounds: makeBounds({ in: 2 }), reverseFloor: 0 });

    result.current.shuttleBackward();
    rafCallbacks[0]?.(1000);
    rafCallbacks[1]?.(2000); // dt=1s -> would go to -0.5, floored at 0 (not bounds.in=2)
    expect(video.currentTime).toBe(0);
  });

  it("raises the reverse speed ladder on repeated J presses without re-pausing", () => {
    const video = makeFakeVideo();
    const { result } = renderVideoPreviewStyle(video, { bounds: makeBounds({ in: 0 }) });
    video.currentTime = 5;

    result.current.shuttleBackward();
    vi.mocked(video.pause).mockClear();
    result.current.shuttleBackward(); // repeat press: bumps level, doesn't re-pause
    expect(video.pause).not.toHaveBeenCalled();

    rafCallbacks[0]?.(1000);
    rafCallbacks[1]?.(1500); // dt=0.5s at level 2x -> decreases by 1
    expect(video.currentTime).toBe(4);
  });

  it("shuttleStop pauses and resets shuttle state (unmutes)", () => {
    const video = makeFakeVideo();
    const { result } = renderVideoPreviewStyle(video);

    result.current.shuttleBackward();
    expect(video.muted).toBe(true);
    result.current.shuttleStop();
    expect(video.pause).toHaveBeenCalled();
    expect(video.muted).toBe(false);
  });

  it("cancels any in-flight rAF loop on unmount", () => {
    const video = makeFakeVideo();
    const { result, unmount } = renderHook(() =>
      useShuttle({ getVideo: () => video, bounds: makeBounds(), setCurrentTime: vi.fn() }),
    );
    result.current.shuttleBackward();
    unmount();
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });

  describe("SequencePlayer-only extension points", () => {
    it("onReset fires on every resetShuttle (direct call, shuttleStop, and reverse-floor auto-stop)", () => {
      const video = makeFakeVideo();
      const onReset = vi.fn();
      const { result } = renderVideoPreviewStyle(video, { onReset });

      result.current.resetShuttle();
      expect(onReset).toHaveBeenCalledTimes(1);

      result.current.shuttleBackward();
      result.current.shuttleStop();
      expect(onReset).toHaveBeenCalledTimes(2);
    });

    it("onStop fires for an explicit shuttleStop and for the reverse loop auto-stopping at its floor, but not for a plain resetShuttle", () => {
      const video = makeFakeVideo();
      video.currentTime = 5;
      const onStop = vi.fn();
      const { result } = renderVideoPreviewStyle(video, { bounds: makeBounds({ in: 4 }), onStop });

      result.current.resetShuttle();
      expect(onStop).not.toHaveBeenCalled();

      result.current.shuttleStop();
      expect(onStop).toHaveBeenCalledTimes(1);

      result.current.shuttleBackward();
      rafCallbacks[0]?.(1000);
      rafCallbacks[1]?.(2000); // dt=1s -> reaches the floor (4), auto-stops
      expect(onStop).toHaveBeenCalledTimes(2);
    });

    it("onBackwardStart fires only when reverse shuttle actually starts, not on repeated J presses", () => {
      const video = makeFakeVideo();
      const onBackwardStart = vi.fn();
      const { result } = renderVideoPreviewStyle(video, { onBackwardStart });

      result.current.shuttleBackward();
      expect(onBackwardStart).toHaveBeenCalledTimes(1);
      result.current.shuttleBackward();
      expect(onBackwardStart).toHaveBeenCalledTimes(1);
    });
  });
});
