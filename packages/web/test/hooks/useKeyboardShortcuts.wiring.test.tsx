// @vitest-environment jsdom
import { cleanup, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useBlockingOverlay } from "../../src/lib/modalStack.js";
import { useKeyboardShortcuts } from "../../src/hooks/useKeyboardShortcuts.js";
import type { VideoPreviewHandle } from "../../src/components/VideoPreview.js";

afterEach(cleanup);

function makeVideoHandle(): VideoPreviewHandle {
  return {
    togglePlay: vi.fn(),
    seekBy: vi.fn(),
    setInFromCurrent: vi.fn(),
    setOutFromCurrent: vi.fn(),
    splitAtCurrent: vi.fn(),
    startCropEdit: vi.fn(),
    shuttleForward: vi.fn(),
    shuttleBackward: vi.fn(),
    shuttleStop: vi.fn(),
  };
}

describe("useKeyboardShortcuts (wiring)", () => {
  it("dispatches Space to the video preview handle only on the edit step", () => {
    const videoHandle = makeVideoHandle();
    const { rerender } = renderHook(
      ({ step }: { step: string }) =>
        useKeyboardShortcuts({
          step,
          sequenceMode: false,
          selectedIndex: 0,
          selectRelative: vi.fn(),
          onUndo: vi.fn(),
          onRedo: vi.fn(),
          onToggleShortcuts: vi.fn(),
          onMerge: vi.fn(),
          videoPreviewRef: { current: videoHandle },
          sequencePlayerRef: { current: null },
        }),
      { initialProps: { step: "compose" } },
    );

    fireEvent.keyDown(window, { key: " " });
    expect(videoHandle.togglePlay).not.toHaveBeenCalled();

    rerender({ step: "edit" });
    fireEvent.keyDown(window, { key: " " });
    expect(videoHandle.togglePlay).toHaveBeenCalledOnce();
  });

  it("a registered blocking overlay (e.g. crop edit mode) suppresses shortcuts, including undo", () => {
    const onUndo = vi.fn();
    const videoHandle = makeVideoHandle();
    const { result, rerender } = renderHook(
      ({ overlayOpen }: { overlayOpen: boolean }) => {
        useBlockingOverlay(overlayOpen);
        useKeyboardShortcuts({
          step: "edit",
          sequenceMode: false,
          selectedIndex: 0,
          selectRelative: vi.fn(),
          onUndo,
          onRedo: vi.fn(),
          onToggleShortcuts: vi.fn(),
          onMerge: vi.fn(),
          videoPreviewRef: { current: videoHandle },
          sequencePlayerRef: { current: null },
        });
      },
      { initialProps: { overlayOpen: true } },
    );
    void result;

    fireEvent.keyDown(window, { key: "z", metaKey: true });
    expect(onUndo).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "i" });
    expect(videoHandle.setInFromCurrent).not.toHaveBeenCalled();

    rerender({ overlayOpen: false });
    fireEvent.keyDown(window, { key: "z", metaKey: true });
    expect(onUndo).toHaveBeenCalledOnce();
  });

  it("Cmd+J calls onMerge with the current selectedIndex", () => {
    const onMerge = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts({
        step: "edit",
        sequenceMode: false,
        selectedIndex: 4,
        selectRelative: vi.fn(),
        onUndo: vi.fn(),
        onRedo: vi.fn(),
        onToggleShortcuts: vi.fn(),
        onMerge,
        videoPreviewRef: { current: makeVideoHandle() },
        sequencePlayerRef: { current: null },
      }),
    );

    fireEvent.keyDown(window, { key: "j", metaKey: true });
    expect(onMerge).toHaveBeenCalledWith(4);
  });
});
