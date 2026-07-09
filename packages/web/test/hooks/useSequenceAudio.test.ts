// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { BgmCue, CueSheet, Segment } from "@cuesheet/schema";
import { useSequenceAudio } from "../../src/hooks/useSequenceAudio.js";

// jsdom doesn't implement HTMLMediaElement.play()/load() - stub them so assigning .src / calling
// .play() doesn't throw (same pattern as BgmSettingsPanel.test.tsx).
beforeAll(() => {
  HTMLMediaElement.prototype.play = vi.fn(function (this: HTMLMediaElement) {
    Object.defineProperty(this, "paused", { value: false, configurable: true });
    return Promise.resolve();
  });
  HTMLMediaElement.prototype.pause = vi.fn(function (this: HTMLMediaElement) {
    Object.defineProperty(this, "paused", { value: true, configurable: true });
  });
  HTMLMediaElement.prototype.load = () => {};
});

afterEach(() => {
  cleanup();
  // play/pause are shared vi.fn()s on the prototype (every HTMLAudioElement instance/test reads
  // the same mock's call history) - clear call counts between tests so each test only sees its
  // own calls. (Only calls/results are cleared; the custom implementation set in beforeAll stays.)
  vi.clearAllMocks();
});

function seg(overrides: Partial<Segment> = {}): Segment {
  return { clip: "a.mp4", in: 0, out: 10, speed: 1, volume: 1, subtitle: "", ...overrides };
}

function bgmCue(overrides: Partial<BgmCue> = {}): BgmCue {
  return { file: "media/bgm/track1.mp3", start: 0, end: 20, volume: 0.8, ...overrides };
}

function baseCue(overrides: Partial<CueSheet> = {}): CueSheet {
  return {
    project: { name: "p", fps: 30, width: 1920, height: 1080 },
    clipDir: "media/clips",
    intro: null,
    outro: null,
    segments: [seg()],
    bgm: [],
    subtitleStyle: {
      font: "sans-serif",
      size: 40,
      color: "#fff",
      outlineColor: "#000",
      outlineWidth: 2,
      position: "bottom",
      margin: 24,
    },
    ...overrides,
  };
}

/** Every audio element the hook has created so far, in creation order (across both bgm + narration). */
function allAudioInstances(spy: ReturnType<typeof vi.spyOn>): HTMLAudioElement[] {
  return spy.mock.results.map((r) => r.value as HTMLAudioElement);
}

describe("useSequenceAudio - bgm", () => {
  it("creates one audio element per bgm track, sets its src from the track's file, and plays/seeks when in-window", () => {
    const AudioSpy = vi.spyOn(globalThis, "Audio");
    const cue = baseCue({ bgm: [bgmCue({ file: "media/bgm/track1.mp3", start: 5, end: 15, volume: 0.5 })] });

    renderHook(() => useSequenceAudio({ cue, positionS: 8, playing: true, rate: 1, narrationFiles: [] }));

    const [audio] = allAudioInstances(AudioSpy);
    expect(audio).toBeDefined();
    expect(audio!.src).toContain(encodeURIComponent("media/bgm/track1.mp3"));
    expect(audio!.currentTime).toBeCloseTo(3, 6); // seekS = 8 - 5
    expect(audio!.volume).toBeCloseTo(0.5, 6);
    expect(audio!.play).toHaveBeenCalled();
    AudioSpy.mockRestore();
  });

  it("does not play a bgm track while positionS is outside its [start, end) window", () => {
    const AudioSpy = vi.spyOn(globalThis, "Audio");
    const cue = baseCue({ bgm: [bgmCue({ start: 5, end: 15 })] });

    renderHook(() => useSequenceAudio({ cue, positionS: 1, playing: true, rate: 1, narrationFiles: [] }));

    const [audio] = allAudioInstances(AudioSpy);
    expect(audio!.play).not.toHaveBeenCalled();
    AudioSpy.mockRestore();
  });

  it("pauses a currently-playing track once playback is toggled off (playing=false)", () => {
    const AudioSpy = vi.spyOn(globalThis, "Audio");
    const cue = baseCue({ bgm: [bgmCue({ start: 0, end: 20 })] });

    const { rerender } = renderHook(
      ({ playing }: { playing: boolean }) => useSequenceAudio({ cue, positionS: 5, playing, rate: 1, narrationFiles: [] }),
      { initialProps: { playing: true } },
    );
    const [audio] = allAudioInstances(AudioSpy);
    expect(audio!.play).toHaveBeenCalledTimes(1);

    rerender({ playing: false });
    expect(audio!.pause).toHaveBeenCalled();
    AudioSpy.mockRestore();
  });

  it("scales bgm playbackRate with the user rate (Play all 1x/1.5x/2x)", () => {
    const AudioSpy = vi.spyOn(globalThis, "Audio");
    const cue = baseCue({ bgm: [bgmCue({ start: 0, end: 20 })] });

    const { rerender } = renderHook(
      ({ rate }: { rate: number }) => useSequenceAudio({ cue, positionS: 5, playing: true, rate, narrationFiles: [] }),
      { initialProps: { rate: 1 } },
    );
    const [audio] = allAudioInstances(AudioSpy);
    expect(audio!.playbackRate).toBe(1);

    rerender({ rate: 2 });
    expect(audio!.playbackRate).toBe(2);
    AudioSpy.mockRestore();
  });

  it("resyncs (seeks) once drift from the expected position exceeds 0.25s, but leaves small jitter alone", () => {
    const AudioSpy = vi.spyOn(globalThis, "Audio");
    const cue = baseCue({ bgm: [bgmCue({ start: 0, end: 20 })] });

    const { rerender } = renderHook(
      ({ positionS }: { positionS: number }) =>
        useSequenceAudio({ cue, positionS, playing: true, rate: 1, narrationFiles: [] }),
      { initialProps: { positionS: 5 } },
    );
    const [audio] = allAudioInstances(AudioSpy);
    expect(audio!.currentTime).toBeCloseTo(5, 6);

    // Simulate real playback advancing the element's own clock slightly ahead of the small React
    // position tick (typical timeupdate jitter) - within threshold, so no forced seek.
    Object.defineProperty(audio, "currentTime", { value: 5.1, writable: true, configurable: true });
    rerender({ positionS: 5.15 });
    expect(audio!.currentTime).toBeCloseTo(5.1, 6); // untouched - drift (0.05) is under threshold

    // A big jump (e.g. progress-bar click seek) - drift now exceeds 0.25s, must force a reseek.
    rerender({ positionS: 12 });
    expect(audio!.currentTime).toBeCloseTo(12, 6);
    AudioSpy.mockRestore();
  });

  it("tears down an audio element for a bgm track removed mid-playback", () => {
    const AudioSpy = vi.spyOn(globalThis, "Audio");
    const cue1 = baseCue({ bgm: [bgmCue({ start: 0, end: 20 })] });

    const { rerender } = renderHook(
      ({ cue }: { cue: CueSheet }) => useSequenceAudio({ cue, positionS: 5, playing: true, rate: 1, narrationFiles: [] }),
      { initialProps: { cue: cue1 } },
    );
    const [audio] = allAudioInstances(AudioSpy);
    expect(audio!.play).toHaveBeenCalledTimes(1);

    const cue2 = baseCue({ bgm: [] });
    rerender({ cue: cue2 });
    expect(audio!.pause).toHaveBeenCalled();
    // .src (the IDL attribute) resolves an empty content attribute to the document's base URL per
    // spec, so check the raw content attribute instead, which reflects exactly what was assigned.
    expect(audio!.getAttribute("src")).toBe("");
    AudioSpy.mockRestore();
  });

  it("pauses and clears every managed element on unmount", () => {
    const AudioSpy = vi.spyOn(globalThis, "Audio");
    const cue = baseCue({ bgm: [bgmCue({ start: 0, end: 20 })] });

    const { unmount } = renderHook(() =>
      useSequenceAudio({ cue, positionS: 5, playing: true, rate: 1, narrationFiles: [] }),
    );
    const [audio] = allAudioInstances(AudioSpy);
    unmount();
    expect(audio!.pause).toHaveBeenCalled();
    expect(audio!.getAttribute("src")).toBe("");
    AudioSpy.mockRestore();
  });
});

describe("useSequenceAudio - narration", () => {
  function narrationCue(): CueSheet {
    return baseCue({
      segments: [seg({ in: 0, out: 20, narration: "line1.wav" })],
      narration: { enabled: true, dir: "media/narration", volume: 0.9 },
    });
  }

  it("plays the active segment's narration file at narration.volume, seeked to its own offset", () => {
    const AudioSpy = vi.spyOn(globalThis, "Audio");
    const cue = narrationCue();

    renderHook(() =>
      useSequenceAudio({ cue, positionS: 2, playing: true, rate: 1, narrationFiles: [{ name: "line1.wav", durationS: 8 }] }),
    );
    const [audio] = allAudioInstances(AudioSpy);
    expect(audio!.src).toContain(encodeURIComponent("line1.wav"));
    expect(audio!.currentTime).toBeCloseTo(2, 6);
    expect(audio!.volume).toBeCloseTo(0.9, 6);
    expect(audio!.play).toHaveBeenCalled();
    AudioSpy.mockRestore();
  });

  it("does not create/play narration audio when narration is disabled", () => {
    const AudioSpy = vi.spyOn(globalThis, "Audio");
    const cue = baseCue({ segments: [seg({ narration: "line1.wav" })] });

    renderHook(() => useSequenceAudio({ cue, positionS: 2, playing: true, rate: 1, narrationFiles: [] }));
    expect(AudioSpy).not.toHaveBeenCalled();
    AudioSpy.mockRestore();
  });

  it("swaps the shared narration element's src when the active narrated segment changes", () => {
    const AudioSpy = vi.spyOn(globalThis, "Audio");
    const cue = baseCue({
      segments: [seg({ in: 0, out: 10, narration: "line1.wav" }), seg({ in: 0, out: 10, narration: "line2.wav" })],
      narration: { enabled: true, dir: "media/narration", volume: 1 },
    });
    const files = [
      { name: "line1.wav", durationS: 8 },
      { name: "line2.wav", durationS: 8 },
    ];

    const { rerender } = renderHook(
      ({ positionS }: { positionS: number }) =>
        useSequenceAudio({ cue, positionS, playing: true, rate: 1, narrationFiles: files }),
      { initialProps: { positionS: 2 } },
    );
    expect(AudioSpy).toHaveBeenCalledTimes(1);
    const [audio] = allAudioInstances(AudioSpy);
    expect(audio!.src).toContain(encodeURIComponent("line1.wav"));

    rerender({ positionS: 12 }); // second segment's window (output start 10, duration 8)
    // Still a single shared element (no second Audio() created) - only its src changes.
    expect(AudioSpy).toHaveBeenCalledTimes(1);
    expect(audio!.src).toContain(encodeURIComponent("line2.wav"));
    AudioSpy.mockRestore();
  });
});
