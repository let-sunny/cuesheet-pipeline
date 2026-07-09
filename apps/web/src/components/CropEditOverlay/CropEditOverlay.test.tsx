// @vitest-environment jsdom
import { createRef } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Crop } from "@cuesheet/schema";
import { CropEditOverlay } from "./CropEditOverlay.js";

beforeAll(() => {
  // jsdom doesn't implement the Pointer Events capture methods this component's drag handlers call.
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.hasPointerCapture = () => false;
});

afterEach(cleanup);

const crop: Crop = { x: 0.25, y: 0.1, w: 0.5, h: 0.4 };

function renderOverlay(onChange = vi.fn(), lockRatio?: number) {
  const frameRef = createRef<HTMLDivElement>();
  render(
    <div ref={frameRef} style={{ width: 400, height: 300 }}>
      <CropEditOverlay crop={crop} frameRef={frameRef} onChange={onChange} lockRatio={lockRatio} />
    </div>,
  );
  vi.spyOn(frameRef.current!, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 400,
    bottom: 300,
    width: 400,
    height: 300,
    toJSON: () => ({}),
  } as DOMRect);
  return { onChange };
}

describe("CropEditOverlay", () => {
  it("renders the crop box sized/positioned from the crop ratios", () => {
    renderOverlay();
    const box = screen.getByTestId("crop-edit-box");
    expect(box.style.left).toBe("25%");
    expect(box.style.top).toBe("10%");
    expect(box.style.width).toBe("50%");
    expect(box.style.height).toBe("40%");
  });

  it("renders all 8 resize handles", () => {
    renderOverlay();
    for (const id of ["nw", "n", "ne", "e", "se", "s", "sw", "w"]) {
      expect(screen.getByTestId(`crop-edit-handle-${id}`)).not.toBeNull();
    }
  });

  it("reports a translated crop via onChange while dragging the box (move)", () => {
    const { onChange } = renderOverlay();
    const box = screen.getByTestId("crop-edit-box");
    fireEvent.pointerDown(box, { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(box, { clientX: 140, clientY: 100, buttons: 1 });
    expect(onChange).toHaveBeenCalledOnce();
    const next = onChange.mock.calls[0]![0] as Crop;
    // dx = 40/400 = 0.1 -> x moves from 0.25 to 0.35; w/h/y stay put.
    expect(next.x).toBeCloseTo(0.35);
    expect(next.y).toBeCloseTo(0.1);
    expect(next.w).toBe(0.5);
    expect(next.h).toBe(0.4);
  });

  it("reports a resized crop via onChange while dragging a handle", () => {
    const { onChange } = renderOverlay(vi.fn(), 1);
    const seHandle = screen.getByTestId("crop-edit-handle-se");
    fireEvent.pointerDown(seHandle, { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(seHandle, { clientX: 140, clientY: 130, buttons: 1 });
    expect(onChange).toHaveBeenCalledOnce();
    const next = onChange.mock.calls[0]![0] as Crop;
    // Growing from the se handle keeps the opposite (nw) corner anchored.
    expect(next.x).toBeCloseTo(crop.x);
    expect(next.y).toBeCloseTo(crop.y);
    expect(next.w).toBeGreaterThan(crop.w);
    expect(next.h).toBeGreaterThan(crop.h);
  });

  it("ignores pointermove once the pointer button is released (buttons: 0)", () => {
    const { onChange } = renderOverlay();
    const box = screen.getByTestId("crop-edit-box");
    fireEvent.pointerDown(box, { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(box, { clientX: 140, clientY: 100, buttons: 0 });
    expect(onChange).not.toHaveBeenCalled();
  });
});
