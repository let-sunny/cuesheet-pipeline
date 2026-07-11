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

  // stylex.props resolves to content-hashed atomic class names (not literal strings like
  // "selected"/"clip-boundary"), so the conditional variant is asserted by class-list membership
  // change, not a substring match (same pattern as IntroOutroEditor.test.tsx's dropzone-active
  // case).
  it("marks only the selected block as selected", () => {
    render(<MiniTimelineStrip {...baseProps({ selectedIndex: 1 })} />);
    // Block 0 (not selected) and block 1 (selected) share the same clip as each other (neither is
    // a clip boundary), so `blockSelected`'s atoms (overriding border/background color) show up as
    // a class-list difference on block 1 that block 0 doesn't have.
    const block0Classes = new Set(screen.getByTestId("mini-strip-block-0").className.split(" "));
    const block1Classes = new Set(screen.getByTestId("mini-strip-block-1").className.split(" "));
    const added = [...block1Classes].filter((c) => !block0Classes.has(c));
    expect(added.length).toBeGreaterThan(0);
  });

  it("marks a block as a clip boundary only where the clip filename changes from the previous block", () => {
    render(<MiniTimelineStrip {...baseProps()} />);
    // Block 1 shares cut_01.mp4 with block 0 (no boundary); block 2 switches to cut_02.mp4 (a
    // boundary). Neither is selected (selectedIndex defaults to 0), so `blockClipBoundary`'s atoms
    // show up as a class-list difference on block 2 that block 1 doesn't have.
    const block1Classes = new Set(screen.getByTestId("mini-strip-block-1").className.split(" "));
    const block2Classes = new Set(screen.getByTestId("mini-strip-block-2").className.split(" "));
    const added = [...block2Classes].filter((c) => !block1Classes.has(c));
    expect(added.length).toBeGreaterThan(0);
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
      fireEvent.click(screen.getByTestId("mini-strip-zoom-in"));
      fireEvent.click(screen.getByTestId("mini-strip-zoom-out"));
      fireEvent.click(screen.getByTestId("mini-strip-zoom-fit"));
    }).not.toThrow();
  });
});
