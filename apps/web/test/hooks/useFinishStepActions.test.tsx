// @vitest-environment jsdom
import { useState } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CueSheet } from "@cuesheet/schema";
import { useFinishStepActions } from "../../src/hooks/useFinishStepActions.js";
import { makeCueSheet } from "../helpers/fixtures.js";

afterEach(cleanup);

function setup(initial: CueSheet, dirty = false) {
  const toast = vi.fn();
  const hook = renderHook(() => {
    const [draft, setDraft] = useState<CueSheet | null>(initial);
    const actions = useFinishStepActions({
      draft,
      setDraft,
      recordDiscreteChange: vi.fn(),
      recordContinuousChange: vi.fn(),
      dirty,
      toast,
    });
    return { draft, ...actions };
  });
  return { ...hook, toast };
}

describe("useFinishStepActions", () => {
  it("createSubtitleStylePreset refuses to overwrite an existing preset name", () => {
    const sheet = makeCueSheet({ subtitleStylePresets: { existing: {} } });
    const { result } = setup(sheet);

    act(() => result.current.createSubtitleStylePreset("existing"));

    expect(Object.keys(result.current.draft?.subtitleStylePresets ?? {})).toEqual(["existing"]);
  });

  it("createSubtitleStylePreset trims the name and adds a blank preset", () => {
    const { result } = setup(makeCueSheet());

    act(() => result.current.createSubtitleStylePreset("  inner-voice  "));

    expect(result.current.draft?.subtitleStylePresets).toEqual({ "inner-voice": {} });
  });

  it("deleteSubtitleStylePreset clears stylePreset off every segment referencing it", () => {
    const sheet = makeCueSheet({
      subtitleStylePresets: { loud: {} },
      segments: [
        { clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "", stylePreset: "loud" },
      ],
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { result } = setup(sheet);

    act(() => result.current.deleteSubtitleStylePreset("loud"));

    expect(result.current.draft?.subtitleStylePresets).toEqual({});
    expect(result.current.draft?.segments[0]?.stylePreset).toBeNull();
  });

  it("handleChangeResolution is a no-op when the resolution is unchanged", () => {
    const { result } = setup(makeCueSheet());
    const before = result.current.draft;

    act(() => result.current.handleChangeResolution(1920, 1080));

    expect(result.current.draft).toBe(before);
  });

  it("handleDownloadSrt toasts instead of navigating while dirty", () => {
    const { result, toast } = setup(makeCueSheet(), true);
    const originalHref = window.location.href;

    act(() => result.current.handleDownloadSrt());

    expect(toast).toHaveBeenCalledWith({ type: "info", body: "Save first before downloading." });
    expect(window.location.href).toBe(originalHref);
  });
});
