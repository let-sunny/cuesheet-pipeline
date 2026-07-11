// @vitest-environment jsdom
import type { ComponentProps } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BgmCue, Segment } from "@cuesheet/schema";
import { BgmSidePanel } from "./BgmSidePanel.js";

afterEach(cleanup);

function segment(overrides: Partial<Segment> = {}): Segment {
  return {
    clip: "cut_01.mp4",
    in: 0,
    out: 5,
    speed: 1,
    volume: 1,
    subtitle: "",
    ...overrides,
  } as Segment;
}

function baseProps(overrides: Partial<ComponentProps<typeof BgmSidePanel>> = {}) {
  return {
    bgm: [] as BgmCue[],
    segments: [segment(), segment({ in: 5, out: 10 }), segment({ in: 10, out: 15 })],
    selectedBgmIndex: null,
    onSelectBgm: vi.fn(),
    onAddBgmTrack: vi.fn(),
    onChangeBgmRange: vi.fn(),
    rowRects: [
      { top: 500, height: 120 },
      { top: 620, height: 120 },
      { top: 740, height: 120 },
    ],
    onDragHighlightChange: vi.fn(),
    ...overrides,
  };
}

describe("BgmSidePanel", () => {
  it("renders collapsed by default (no gutter/bars, no add-track button)", () => {
    render(<BgmSidePanel {...baseProps()} />);
    expect(screen.queryByTestId("bgm-gutter")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add background music track" })).toBeNull();
    expect(screen.getByRole("button", { name: "Expand background music panel" })).not.toBeNull();
  });

  it("expands on toggle click, revealing the gutter and the add-track button", () => {
    render(<BgmSidePanel {...baseProps()} />);
    fireEvent.click(screen.getByTestId("bgm-panel-toggle"));
    expect(screen.getByTestId("bgm-gutter")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Add background music track" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Collapse background music panel" })).not.toBeNull();
  });

  it("shows the track count on the rail even while collapsed", () => {
    const bgm: BgmCue[] = [{ file: "bgm.mp3", start: 0, end: 5, volume: 1 }];
    render(<BgmSidePanel {...baseProps({ bgm })} />);
    expect(screen.getByText("1")).not.toBeNull();
  });

  it("calls onAddBgmTrack when the add-track button is clicked", () => {
    const onAddBgmTrack = vi.fn();
    render(<BgmSidePanel {...baseProps({ onAddBgmTrack })} />);
    fireEvent.click(screen.getByTestId("bgm-panel-toggle"));
    fireEvent.click(screen.getByTestId("bgm-add-track"));
    expect(onAddBgmTrack).toHaveBeenCalledTimes(1);
  });

  it("positions a bar's top/height from the passed-in rowRects, relative to the gutter's own on-screen top", () => {
    // The gutter container itself sits at viewport top 500 (mocked below) - same page-level
    // offset the mocked rowRects share, so a bar covering rows 0-1 should render at top:0.
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      const top = this.getAttribute("data-testid") === "bgm-gutter" ? 500 : 0;
      return { top, bottom: top, height: 0, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
    };

    try {
      // 3 segments of 5s each (cumulative cut starts 0/5/10/15) - a bgm cue spanning seconds 0-10
      // covers cuts 0-1 (rows 0-1).
      const bgm: BgmCue[] = [{ file: "bgm.mp3", start: 0, end: 10, volume: 1 }];
      render(<BgmSidePanel {...baseProps({ bgm })} />);
      fireEvent.click(screen.getByTestId("bgm-panel-toggle"));

      const bar = screen.getByTestId("bgm-bar-0");
      // row0.top (500) - gutter.top (500) = 0.
      expect(bar.style.top).toBe("0px");
      // bottom = row1.top(620) + row1.height(120) - gutter.top(500) = 240.
      expect(bar.style.height).toBe("240px");
    } finally {
      HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    }
  });

  it("prevents default on a bar/handle pointerdown (E2E regression guard, see CompactSegmentList's textarea drag-over-focus fix)", () => {
    const bgm: BgmCue[] = [{ file: "bgm.mp3", start: 0, end: 5, volume: 1 }];
    render(<BgmSidePanel {...baseProps({ bgm })} />);
    fireEvent.click(screen.getByTestId("bgm-panel-toggle"));
    const handle = screen.getByTestId("bgm-bar-0-handle-start");
    const event = fireEvent.pointerDown(handle, { bubbles: true, cancelable: true });
    // jsdom's fireEvent returns false if preventDefault was called.
    expect(event).toBe(false);
  });

  it("selects the track and reports a drag highlight while dragging a bar", () => {
    const onSelectBgm = vi.fn();
    const onChangeBgmRange = vi.fn();
    const onDragHighlightChange = vi.fn();
    const bgm: BgmCue[] = [{ file: "bgm.mp3", start: 0, end: 5, volume: 1 }];
    render(
      <BgmSidePanel
        {...baseProps({ bgm, onSelectBgm, onChangeBgmRange, onDragHighlightChange })}
      />,
    );
    fireEvent.click(screen.getByTestId("bgm-panel-toggle"));

    const bar = screen.getByTestId("bgm-bar-0");
    fireEvent.pointerDown(bar, { clientY: 500 });
    expect(onSelectBgm).toHaveBeenCalledWith(0);

    // rowRects mocked at top 500/620/740, all height 120 - moving to y=650 lands in row 1's band.
    fireEvent.pointerMove(window, { clientY: 650 });
    expect(onDragHighlightChange).toHaveBeenCalledWith({ start: 1, end: 1 });
    expect(onChangeBgmRange).toHaveBeenCalledWith(0, 1, 1);

    fireEvent.pointerUp(window);
    expect(onDragHighlightChange).toHaveBeenLastCalledWith(null);
  });
});
