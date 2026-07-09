// @vitest-environment jsdom
import { useState } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CueSheet, Segment } from "@cuesheet/schema";
import { useComposeStepActions } from "../../src/hooks/useComposeStepActions.js";
import { makeCueSheet } from "../helpers/fixtures.js";

afterEach(cleanup);

function setup(initial: CueSheet) {
  return renderHook(() => {
    const [draft, setDraft] = useState<CueSheet | null>(initial);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const actions = useComposeStepActions({
      draft,
      setDraft,
      recordDiscreteChange: vi.fn(),
      setSelectedIndex,
    });
    return { draft, selectedIndex, ...actions };
  });
}

describe("useComposeStepActions", () => {
  it("addMomentSegment inserts in chronological (clip, in) order regardless of insertion order", () => {
    const sheet = makeCueSheet({
      segments: [
        { clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "first" },
        { clip: "a.mp4", in: 10, out: 15, speed: 1, volume: 1, subtitle: "third" },
      ],
    });
    const { result } = setup(sheet);

    const middle: Segment = { clip: "a.mp4", in: 5, out: 10, speed: 1, volume: 1, subtitle: "second" };
    act(() => result.current.addMomentSegment(middle));

    expect(result.current.draft?.segments.map((s) => s.subtitle)).toEqual(["first", "second", "third"]);
    expect(result.current.selectedIndex).toBe(1);
  });

  it("removeMatchingSegments only removes segments overlapping the given clip/range", () => {
    const sheet = makeCueSheet({
      segments: [
        { clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "keep" },
        { clip: "a.mp4", in: 5, out: 10, speed: 1, volume: 1, subtitle: "remove" },
      ],
    });
    const { result } = setup(sheet);

    act(() => result.current.removeMatchingSegments("a.mp4", 5, 10));

    expect(result.current.draft?.segments.map((s) => s.subtitle)).toEqual(["keep"]);
  });

  it("removeMatchingSegments is a no-op if it would remove every segment", () => {
    const sheet = makeCueSheet({
      segments: [{ clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "only" }],
    });
    const { result } = setup(sheet);

    act(() => result.current.removeMatchingSegments("a.mp4", 0, 5));

    expect(result.current.draft?.segments.length).toBe(1);
  });
});
