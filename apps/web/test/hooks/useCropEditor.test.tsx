// @vitest-environment jsdom
import { act, cleanup, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Segment } from "@cuesheet/schema";
import { useCropEditor } from "../../src/hooks/useCropEditor.js";
import { isBlockingOverlayOpen } from "../../src/lib/modalStack.js";

afterEach(cleanup);

function makeSegment(overrides: Partial<Segment> = {}): Segment {
  return { clip: "a.mp4", in: 0, out: 10, speed: 1, volume: 1, subtitle: "", ...overrides };
}

describe("useCropEditor", () => {
  it("startCropEdit seeds the draft from the segment's existing crop", () => {
    const segment = makeSegment({ crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.5 } });
    const { result } = renderHook(() =>
      useCropEditor({ segment, projectWidth: 1920, projectHeight: 1080, naturalSize: null, onChange: vi.fn() }),
    );
    act(() => result.current.startCropEdit());
    expect(result.current.cropEditDraft).toEqual({ x: 0.1, y: 0.2, w: 0.5, h: 0.5 });
  });

  it("startCropEdit with no existing crop defaults to a centered 70%-of-max box", () => {
    const segment = makeSegment();
    const { result } = renderHook(() =>
      useCropEditor({ segment, projectWidth: 1920, projectHeight: 1080, naturalSize: null, onChange: vi.fn() }),
    );
    act(() => result.current.startCropEdit());
    // lockRatio 1 -> max box is the full frame -> 70% of it, centered.
    expect(result.current.cropEditDraft?.x).toBeCloseTo(0.15, 10);
    expect(result.current.cropEditDraft?.y).toBeCloseTo(0.15, 10);
    expect(result.current.cropEditDraft?.w).toBeCloseTo(0.7, 10);
    expect(result.current.cropEditDraft?.h).toBeCloseTo(0.7, 10);
  });

  it("applyCropEdit commits the draft via onChange and exits edit mode", () => {
    const onChange = vi.fn();
    const segment = makeSegment();
    const { result } = renderHook(() =>
      useCropEditor({ segment, projectWidth: 1920, projectHeight: 1080, naturalSize: null, onChange }),
    );
    act(() => result.current.startCropEdit());
    act(() => result.current.updateCropDraft({ x: 0.2, y: 0.2, w: 0.4, h: 0.4 }));
    act(() => result.current.applyCropEdit());

    expect(onChange).toHaveBeenCalledWith({ crop: { x: 0.2, y: 0.2, w: 0.4, h: 0.4 } });
    expect(result.current.cropEditDraft).toBeNull();
  });

  it("cancelCropEdit discards the draft without calling onChange", () => {
    const onChange = vi.fn();
    const segment = makeSegment();
    const { result } = renderHook(() =>
      useCropEditor({ segment, projectWidth: 1920, projectHeight: 1080, naturalSize: null, onChange }),
    );
    act(() => result.current.startCropEdit());
    act(() => result.current.cancelCropEdit());
    expect(onChange).not.toHaveBeenCalled();
    expect(result.current.cropEditDraft).toBeNull();
  });

  it("clearCropEdit commits a null crop and exits edit mode", () => {
    const onChange = vi.fn();
    const segment = makeSegment({ crop: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 } });
    const { result } = renderHook(() =>
      useCropEditor({ segment, projectWidth: 1920, projectHeight: 1080, naturalSize: null, onChange }),
    );
    act(() => result.current.startCropEdit());
    act(() => result.current.clearCropEdit());
    expect(onChange).toHaveBeenCalledWith({ crop: null });
    expect(result.current.cropEditDraft).toBeNull();
  });

  it("resetCropEditToFullFrame resets the draft to the max ratio-locked box without exiting", () => {
    const segment = makeSegment();
    const { result } = renderHook(() =>
      useCropEditor({ segment, projectWidth: 1920, projectHeight: 1080, naturalSize: null, onChange: vi.fn() }),
    );
    act(() => result.current.startCropEdit());
    act(() => result.current.resetCropEditToFullFrame());
    expect(result.current.cropEditDraft).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  it("registers as a blocking overlay only while a draft is active", () => {
    const segment = makeSegment();
    const { result } = renderHook(() =>
      useCropEditor({ segment, projectWidth: 1920, projectHeight: 1080, naturalSize: null, onChange: vi.fn() }),
    );
    expect(isBlockingOverlayOpen()).toBe(false);
    act(() => result.current.startCropEdit());
    expect(isBlockingOverlayOpen()).toBe(true);
    act(() => result.current.cancelCropEdit());
    expect(isBlockingOverlayOpen()).toBe(false);
  });

  it("Escape cancels and Enter applies while a draft is active", () => {
    const onChange = vi.fn();
    const segment = makeSegment();
    const { result } = renderHook(() =>
      useCropEditor({ segment, projectWidth: 1920, projectHeight: 1080, naturalSize: null, onChange }),
    );

    act(() => result.current.startCropEdit());
    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(result.current.cropEditDraft).toBeNull();
    expect(onChange).not.toHaveBeenCalled();

    act(() => result.current.startCropEdit());
    act(() => {
      fireEvent.keyDown(window, { key: "Enter" });
    });
    expect(onChange).toHaveBeenCalledOnce();
    const applied = onChange.mock.calls[0]?.[0] as { crop: { x: number; y: number; w: number; h: number } };
    expect(applied.crop.x).toBeCloseTo(0.15, 10);
    expect(applied.crop.y).toBeCloseTo(0.15, 10);
    expect(applied.crop.w).toBeCloseTo(0.7, 10);
    expect(applied.crop.h).toBeCloseTo(0.7, 10);
    expect(result.current.cropEditDraft).toBeNull();
  });

  it("Escape/Enter do nothing while no draft is active", () => {
    const onChange = vi.fn();
    const segment = makeSegment();
    renderHook(() => useCropEditor({ segment, projectWidth: 1920, projectHeight: 1080, naturalSize: null, onChange }));
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });
});
