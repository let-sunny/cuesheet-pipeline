// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { TrimStrip } from "./TrimStrip.js";

let ioCallback: IntersectionObserverCallback | undefined;

// jsdom implements neither IntersectionObserver (SegmentThumb's lazy-load trigger) nor
// ResizeObserver (TrimStrip's own track-width measurement) - stub both, matching
// SegmentThumb.test.tsx's existing pattern.
beforeAll(() => {
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = class {
    constructor(cb: IntersectionObserverCallback) {
      ioCallback = cb;
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  // jsdom doesn't implement the Pointer Events capture methods TrimStrip's drag handlers call.
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.hasPointerCapture = () => false;
});

afterEach(cleanup);

function fireIntersect() {
  act(() => {
    ioCallback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
  });
}

/** Stubs every element's getBoundingClientRect for the duration of one test - TrimStrip's
 * pointer/wheel math reads element rects to convert a clientX into a time. */
function stubRect(rect: Partial<DOMRect>) {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 400,
    bottom: 48,
    width: 400,
    height: 48,
    toJSON: () => ({}),
    ...rect,
  } as DOMRect);
}

const baseProps = {
  clip: "cut_01.mp4",
  currentTimeS: 0,
  onChangeIn: () => {},
  onChangeOut: () => {},
  onSeek: () => {},
};

describe("TrimStrip", () => {
  it("shows a ruler-tick fallback per cell before the thumbnail resolves, then swaps to the image", () => {
    const { container } = render(<TrimStrip {...baseProps} durationS={10} inS={1} outS={3} resetKey={0} />);
    // Default viewport on a 10s clip floors to the whole clip (below TRIM_WINDOW_MIN_S) - a
    // ruler label should be present since no thumbnail has resolved yet (jsdom width is 0, so
    // filmstripThumbTimes still renders at least one cell).
    expect(container.querySelector('[data-testid="trim-strip-filmstrip"]')).toBeTruthy();
    expect(container.textContent).toMatch(/\d+:\d{2}/); // a ruler time label, e.g. "0:05"

    fireIntersect();
    const img = container.querySelector("img");
    expect(img).toBeTruthy();
    act(() => {
      img!.dispatchEvent(new Event("load"));
    });
    // Once resolved, the thumbnail wrapper is no longer hidden.
    const thumbWrapper = img!.parentElement!;
    expect(thumbWrapper.style.visibility).not.toBe("hidden");
  });

  it("the pan control is hidden at Fit clip and appears once zoomed in (Fit cut, on a long clip)", () => {
    const { getByTestId, queryByTestId } = render(
      <TrimStrip {...baseProps} durationS={900} inS={200} outS={203} resetKey={0} />,
    );
    // Default viewport for a short 3s cut inside a 900s clip floors to 20s - already zoomed in,
    // so the pan control should be visible from the start.
    expect(queryByTestId("trim-strip-pan")).toBeTruthy();

    fireEvent.click(getByTestId("trim-strip-fit-clip"));
    expect(queryByTestId("trim-strip-pan")).toBeNull();

    fireEvent.click(getByTestId("trim-strip-fit-cut"));
    expect(queryByTestId("trim-strip-pan")).toBeTruthy();
  });

  it("on a short clip that fits entirely in the default viewport, there's no dead pan chrome", () => {
    const { queryByTestId } = render(<TrimStrip {...baseProps} durationS={3} inS={0.5} outS={2} resetKey={0} />);
    expect(queryByTestId("trim-strip-pan")).toBeNull();
  });

  it("Shift+Z resets the viewport to Fit clip", () => {
    const onViewportChange = vi.fn();
    render(
      <TrimStrip {...baseProps} durationS={900} inS={200} outS={203} resetKey={0} onViewportChange={onViewportChange} />,
    );
    onViewportChange.mockClear();
    fireEvent.keyDown(window, { key: "Z", shiftKey: true });
    expect(onViewportChange).toHaveBeenCalledWith({ start: 0, end: 900 });
  });

  it("Ctrl+wheel zooms in, narrowing the viewport", () => {
    stubRect({ left: 0, width: 400 });
    const onViewportChange = vi.fn();
    const { getByTestId } = render(
      <TrimStrip {...baseProps} durationS={900} inS={200} outS={203} resetKey={0} onViewportChange={onViewportChange} />,
    );
    const widthBefore = last(onViewportChange).end - last(onViewportChange).start;
    onViewportChange.mockClear();

    fireEvent.wheel(getByTestId("trim-strip-filmstrip"), { deltaY: -100, ctrlKey: true, clientX: 200 });

    const widthAfter = last(onViewportChange).end - last(onViewportChange).start;
    expect(widthAfter).toBeLessThan(widthBefore);
  });

  it("dragging the in handle calls onChangeIn and onSeek with the dragged time, clamped by MIN_GAP_S", () => {
    stubRect({ left: 0, width: 400 });
    const onChangeIn = vi.fn();
    const onSeek = vi.fn();
    const { getByTestId } = render(
      <TrimStrip
        {...baseProps}
        durationS={20}
        inS={5}
        outS={10}
        resetKey={0}
        onChangeIn={onChangeIn}
        onSeek={onSeek}
      />,
    );
    // Default viewport for this cut: [5,10] padded 30% each side = [3.5,11.5], width 8 < 20s
    // floor -> centered on 7.5 -> [-2.5,17.5] clamped to [0,17.5] (preserving width 20)... the
    // exact viewport isn't this test's concern; what matters is the handle drag reaches a time
    // near the clip's start and is clamped to stay before Out - MIN_GAP_S.
    const handle = getByTestId("trim-strip-handle-in");
    fireEvent.pointerDown(handle, { clientX: 0, buttons: 1 });
    fireEvent.pointerMove(handle, { clientX: 0, buttons: 1 });

    expect(onChangeIn).toHaveBeenCalled();
    const draggedTo = onChangeIn.mock.calls.at(-1)![0] as number;
    expect(draggedTo).toBeLessThanOrEqual(10 - 0.05 + 1e-9);
    expect(onSeek).toHaveBeenCalledWith(draggedTo);
  });

  it("clicking the track (not a handle) seeks without touching in/out", () => {
    stubRect({ left: 0, width: 400 });
    const onChangeIn = vi.fn();
    const onChangeOut = vi.fn();
    const onSeek = vi.fn();
    const { getByTestId } = render(
      <TrimStrip
        {...baseProps}
        durationS={3}
        inS={0.5}
        outS={2}
        resetKey={0}
        onChangeIn={onChangeIn}
        onChangeOut={onChangeOut}
        onSeek={onSeek}
      />,
    );
    fireEvent.pointerDown(getByTestId("trim-strip-filmstrip"), { clientX: 200, buttons: 1 });
    expect(onSeek).toHaveBeenCalled();
    expect(onChangeIn).not.toHaveBeenCalled();
    expect(onChangeOut).not.toHaveBeenCalled();
  });
});

function last(fn: ReturnType<typeof vi.fn>): { start: number; end: number } {
  return fn.mock.calls.at(-1)![0] as { start: number; end: number };
}
