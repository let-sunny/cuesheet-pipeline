// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Segment } from "@cuesheet/schema";
import { nextShuttleLevel, useShuttle } from "../../src/hooks/useShuttle.js";

afterEach(cleanup);

describe("nextShuttleLevel", () => {
  it("doubles 1 -> 2 -> 4, then caps at 4", () => {
    expect(nextShuttleLevel(1)).toBe(2);
    expect(nextShuttleLevel(2)).toBe(4);
    expect(nextShuttleLevel(4)).toBe(4);
    expect(nextShuttleLevel(8)).toBe(4);
  });
});

function makeSegment(overrides: Partial<Segment> = {}): Segment {
  return { clip: "a.mp4", in: 2, out: 10, speed: 1, volume: 0.8, subtitle: "", ...overrides };
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

  it("shuttleForward is a no-op with no video/segment", () => {
    const setCurrentTime = vi.fn();
    const { result } = renderHook(() => useShuttle({ videoRef: { current: null }, segment: undefined, setCurrentTime }));
    result.current.shuttleForward();
    expect(setCurrentTime).not.toHaveBeenCalled();
  });

  it("shuttleForward starts at 1x, doubles on repeated presses, caps at 4x", () => {
    const video = makeFakeVideo();
    const segment = makeSegment({ speed: 2 });
    const setCurrentTime = vi.fn();
    const { result } = renderHook(() => useShuttle({ videoRef: { current: video }, segment, setCurrentTime }));

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

  it("shuttleForward resets to segment.in when currentTime is outside the cut's range", () => {
    const video = makeFakeVideo();
    video.currentTime = 99; // outside [2, 10]
    const segment = makeSegment();
    const setCurrentTime = vi.fn();
    const { result } = renderHook(() => useShuttle({ videoRef: { current: video }, segment, setCurrentTime }));

    result.current.shuttleForward();
    expect(video.currentTime).toBe(2);
    expect(setCurrentTime).toHaveBeenCalledWith(2);
  });

  it("shuttleBackward pauses, mutes, and switching from forward resets to reverse 1x", () => {
    const video = makeFakeVideo();
    const segment = makeSegment();
    const setCurrentTime = vi.fn();
    const { result } = renderHook(() => useShuttle({ videoRef: { current: video }, segment, setCurrentTime }));

    result.current.shuttleForward();
    expect(video.muted).toBe(false);

    result.current.shuttleBackward();
    expect(video.pause).toHaveBeenCalled();
    expect(video.muted).toBe(true);
    expect(rafCallbacks.length).toBe(1); // reverseTick scheduled
  });

  it("the reverse-playback rAF loop decrements currentTime and stops at segment.in", () => {
    const video = makeFakeVideo();
    video.currentTime = 5;
    const segment = makeSegment({ in: 2, out: 10 });
    const setCurrentTime = vi.fn();
    const { result } = renderHook(() => useShuttle({ videoRef: { current: video }, segment, setCurrentTime }));

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
    expect(video.currentTime).toBe(2); // clamped to segment.in
    expect(video.pause).toHaveBeenCalled(); // shuttleStop() fired once the floor was reached
  });

  it("shuttleStop pauses and resets shuttle state (unmutes)", () => {
    const video = makeFakeVideo();
    const segment = makeSegment();
    const setCurrentTime = vi.fn();
    const { result } = renderHook(() => useShuttle({ videoRef: { current: video }, segment, setCurrentTime }));

    result.current.shuttleBackward();
    expect(video.muted).toBe(true);
    result.current.shuttleStop();
    expect(video.pause).toHaveBeenCalled();
    expect(video.muted).toBe(false);
  });

  it("cancels any in-flight rAF loop on unmount", () => {
    const video = makeFakeVideo();
    const segment = makeSegment();
    const { result, unmount } = renderHook(() =>
      useShuttle({ videoRef: { current: video }, segment, setCurrentTime: vi.fn() }),
    );
    result.current.shuttleBackward();
    unmount();
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });
});
