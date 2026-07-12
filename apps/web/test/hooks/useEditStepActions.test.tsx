// @vitest-environment jsdom
import { useState } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CueSheet } from "@cuesheet/schema";
import { useEditStepActions } from "../../src/hooks/useEditStepActions.js";
import { makeCueSheet } from "../helpers/fixtures.js";

afterEach(cleanup);

function threeSegmentSheet(): CueSheet {
  return makeCueSheet({
    segments: [
      { clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "one" },
      { clip: "a.mp4", in: 5, out: 10, speed: 1, volume: 1, subtitle: "two" },
      { clip: "a.mp4", in: 10, out: 15, speed: 1, volume: 1, subtitle: "three" },
    ],
  });
}

function setup(initial: CueSheet, selectedIndex = 0) {
  return renderHook(() => {
    const [draft, setDraft] = useState<CueSheet | null>(initial);
    const [selIdx, setSelIdx] = useState(selectedIndex);
    const [selBgm, setSelBgm] = useState<number | null>(null);
    const actions = useEditStepActions({
      draft,
      setDraft,
      recordDiscreteChange: vi.fn(),
      recordContinuousChange: vi.fn(),
      selectedIndex: selIdx,
      setSelectedIndex: setSelIdx,
      setSelectedBgmIndex: setSelBgm,
    });
    return { draft, selectedBgmIndex: selBgm, ...actions };
  });
}

describe("useEditStepActions", () => {
  it("addBgmTrack always starts at cut 1, regardless of which cut is selected (default-placement fix)", () => {
    // Previously this anchored to the currently-selected cut, so a track added while cut 4 was
    // selected started mid-list instead of at the top of the gutter.
    const { result } = setup(threeSegmentSheet(), 2);

    act(() => result.current.addBgmTrack());

    const bgm = result.current.draft?.bgm[0];
    expect(bgm?.start).toBe(0);
    // Default span caps at the last cut when there are fewer than 3 cuts (here: 3 cuts -> cut 3's end).
    expect(bgm?.end).toBe(15);
    expect(result.current.selectedBgmIndex).toBe(0);
  });

  it("addBgmTrack's default span caps at 3 cuts when there are more than 3", () => {
    const sheet = makeCueSheet({
      segments: Array.from({ length: 6 }, (_, i) => ({
        clip: "a.mp4",
        in: i * 5,
        out: i * 5 + 5,
        speed: 1,
        volume: 1,
        subtitle: "",
      })),
    });
    const { result } = setup(sheet, 5);

    act(() => result.current.addBgmTrack());

    const bgm = result.current.draft?.bgm[0];
    expect(bgm?.start).toBe(0);
    expect(bgm?.end).toBe(15); // through cut 3 (index 2), 5s per cut -> 15s
  });

  it("mergeSegmentWithNext merges an eligible adjacent pair into one segment spanning both", () => {
    // The two cuts' subtitles differ and are both non-empty, which triggers a confirm() prompt
    // before discarding the next cut's subtitle - stubbed to accept, since that prompt itself is
    // covered by segmentMerge's own tests.
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { result } = setup(threeSegmentSheet());

    act(() => result.current.mergeSegmentWithNext(0));

    expect(result.current.draft?.segments.length).toBe(2);
    expect(result.current.draft?.segments[0]).toMatchObject({ in: 0, out: 10, subtitle: "one" });
  });

  it("toggleSegmentTitle sets a default typing title when turned on, and clears it when turned off", () => {
    const { result } = setup(threeSegmentSheet());

    act(() => result.current.toggleSegmentTitle(0, true));
    expect(result.current.draft?.segments[0]?.title).toEqual({
      text: "Title",
      preset: "typing",
      durationS: 3,
      color: "#ffffff",
      size: 500,
      highlightColor: "#a7c7e7",
    });

    act(() => result.current.toggleSegmentTitle(0, false));
    expect(result.current.draft?.segments[0]?.title).toBeUndefined();
  });

  it("toggleSegmentTransition sets a default fade (0.5s) per side independently", () => {
    const { result } = setup(threeSegmentSheet());

    act(() => result.current.toggleSegmentTransition(0, "in", true));
    expect(result.current.draft?.segments[0]?.transitionIn).toEqual({ type: "fade", durationS: 0.5 });
    expect(result.current.draft?.segments[0]?.transitionOut).toBeUndefined();

    act(() => result.current.toggleSegmentTransition(0, "out", false));
    expect(result.current.draft?.segments[0]?.transitionOut).toBeUndefined();
  });

  it("removeSegment is a no-op when only one cut remains", () => {
    const single = makeCueSheet();
    const { result } = setup(single);

    act(() => result.current.removeSegment(0));

    expect(result.current.draft?.segments.length).toBe(1);
  });
});
