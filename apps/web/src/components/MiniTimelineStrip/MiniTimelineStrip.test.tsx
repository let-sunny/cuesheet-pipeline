// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Segment } from "@cuesheet/schema";
import { MiniTimelineStrip } from "./MiniTimelineStrip.js";

// jsdom implements neither ResizeObserver (viewport width measurement) nor IntersectionObserver
// (SegmentThumb's lazy-load trigger, rendered inside a block once it's wide enough) - stub both,
// matching TrimStrip.test.tsx's existing pattern.
beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(cleanup);

function seg(clip: string, inS: number, outS: number, subtitle = ""): Segment {
  return { clip, in: inS, out: outS, speed: 1, volume: 1, subtitle };
}

const segments: Segment[] = [
  seg("cut_01.mp4", 0, 2, "first"),
  seg("cut_01.mp4", 2, 4, "second"),
  seg("cut_02.mp4", 0, 3, "third"),
];

function baseProps(overrides: Partial<Parameters<typeof MiniTimelineStrip>[0]> = {}) {
  return {
    segments,
    selectedIndex: 0,
    onSelect: vi.fn(),
    onGoToEdit: vi.fn(),
    ...overrides,
  };
}

describe("MiniTimelineStrip", () => {
  it("renders one block per segment and the formatted total duration", () => {
    render(<MiniTimelineStrip {...baseProps()} />);
    expect(screen.getByTestId("mini-strip-block-0")).not.toBeNull();
    expect(screen.getByTestId("mini-strip-block-1")).not.toBeNull();
    expect(screen.getByTestId("mini-strip-block-2")).not.toBeNull();
    // 2s + 2s + 3s = 7s total.
    expect(screen.getByText("0:07")).not.toBeNull();
  });

  it("marks only the selected block as selected", () => {
    render(<MiniTimelineStrip {...baseProps({ selectedIndex: 1 })} />);
    expect(screen.getByTestId("mini-strip-block-0").className).not.toContain("selected");
    expect(screen.getByTestId("mini-strip-block-1").className).toContain("selected");
    expect(screen.getByTestId("mini-strip-block-2").className).not.toContain("selected");
  });

  it("marks a block as a clip boundary only where the clip filename changes from the previous block", () => {
    render(<MiniTimelineStrip {...baseProps()} />);
    // Block 0 has no previous block, block 1 shares cut_01.mp4 with block 0, block 2 switches to cut_02.mp4.
    expect(screen.getByTestId("mini-strip-block-0").className).not.toContain("clip-boundary");
    expect(screen.getByTestId("mini-strip-block-1").className).not.toContain("clip-boundary");
    expect(screen.getByTestId("mini-strip-block-2").className).toContain("clip-boundary");
  });

  it("calls onSelect with the block's index when clicked", () => {
    const onSelect = vi.fn();
    render(<MiniTimelineStrip {...baseProps({ onSelect })} />);
    fireEvent.click(screen.getByTestId("mini-strip-block-2"));
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it("calls onGoToEdit with the block's index when double-clicked, without also resetting zoom", () => {
    const onGoToEdit = vi.fn();
    render(<MiniTimelineStrip {...baseProps({ onGoToEdit })} />);
    fireEvent.doubleClick(screen.getByTestId("mini-strip-block-1"));
    expect(onGoToEdit).toHaveBeenCalledWith(1);
  });

  it("renders zoom controls that can be clicked without throwing", () => {
    render(<MiniTimelineStrip {...baseProps()} />);
    expect(() => {
      fireEvent.click(screen.getByTitle("Zoom in"));
      fireEvent.click(screen.getByTitle("Zoom out"));
      fireEvent.click(screen.getByTitle("Fit to width (Shift+Z)"));
    }).not.toThrow();
  });
});
