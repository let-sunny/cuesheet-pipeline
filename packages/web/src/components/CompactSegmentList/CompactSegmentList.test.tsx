// @vitest-environment jsdom
import type { ComponentProps } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { BgmCue, Segment } from "@cuesheet/schema";
import type { ClipMoments } from "../../api.js";
import { CompactSegmentList } from "./CompactSegmentList.js";

// jsdom doesn't implement IntersectionObserver (SegmentThumb) or scrollIntoView (the
// selected-row-scroll effect) - stub both so rendering doesn't throw.
beforeAll(() => {
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  HTMLElement.prototype.scrollIntoView = () => {};
});

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

function baseProps(overrides: Partial<ComponentProps<typeof CompactSegmentList>> = {}) {
  return {
    segments: [segment({ clip: "cut_01.mp4", subtitle: "first" }), segment({ clip: "cut_02.mp4", in: 5, out: 10 })],
    selectedIndex: 0,
    moments: [] as ClipMoments[],
    onSelect: vi.fn(),
    onChangeSubtitle: vi.fn(),
    onAdd: vi.fn(),
    onRemove: vi.fn(),
    onMove: vi.fn(),
    bgm: [] as BgmCue[],
    selectedBgmIndex: null,
    onSelectBgm: vi.fn(),
    onAddBgmTrack: vi.fn(),
    onChangeBgmRange: vi.fn(),
    ...overrides,
  };
}

describe("CompactSegmentList", () => {
  it("renders one row per segment with its 1-based index", () => {
    render(<CompactSegmentList {...baseProps()} />);
    expect(screen.getByText("1")).not.toBeNull();
    expect(screen.getByText("2")).not.toBeNull();
  });

  it("marks the selected row (className carries the selected variant)", () => {
    render(<CompactSegmentList {...baseProps({ selectedIndex: 1 })} />);
    const rows = document.querySelectorAll('[title="Move up"]');
    // Row 2's Move-up button lives inside `.compact-list-actions`, whose parent is the row div -
    // check that div's class differs between the selected and unselected row.
    const selectedRow = rows[1]!.closest("div")!.parentElement!;
    const unselectedRow = rows[0]!.closest("div")!.parentElement!;
    expect(selectedRow.className).not.toEqual(unselectedRow.className);
  });

  it("calls onSelect when a row is clicked", () => {
    const onSelect = vi.fn();
    render(<CompactSegmentList {...baseProps({ onSelect })} />);
    fireEvent.click(screen.getByDisplayValue("first"));
    expect(onSelect).toHaveBeenCalledWith(0);
  });

  it("calls onChangeSubtitle when the subtitle textarea changes", () => {
    const onChangeSubtitle = vi.fn();
    render(<CompactSegmentList {...baseProps({ onChangeSubtitle })} />);
    fireEvent.change(screen.getByDisplayValue("first"), { target: { value: "updated" } });
    expect(onChangeSubtitle).toHaveBeenCalledWith(0, "updated");
  });

  it("Tab in the last row's subtitle field does not call preventDefault (lets focus leave the list)", () => {
    render(<CompactSegmentList {...baseProps({ selectedIndex: 1 })} />);
    const textareas = screen.getAllByRole("textbox");
    const event = fireEvent.keyDown(textareas[1]!, { key: "Tab", bubbles: true, cancelable: true });
    // jsdom's fireEvent returns false if preventDefault was called - Tab past the last row must not.
    expect(event).toBe(true);
  });

  it("shows the style badge only for segments with a styleOverride", () => {
    render(
      <CompactSegmentList
        {...baseProps({
          segments: [segment({ styleOverride: { size: 24 } as never }), segment()],
        })}
      />,
    );
    expect(screen.getByText("Style")).not.toBeNull();
  });

  it("shows the subtitle dot as filled only when the subtitle is non-empty", () => {
    render(<CompactSegmentList {...baseProps()} />);
    const dots = document.querySelectorAll('[title="Has subtitle"], [title="No subtitle"]');
    expect(dots).toHaveLength(2);
    expect(dots[0]!.getAttribute("title")).toBe("Has subtitle");
    expect(dots[1]!.getAttribute("title")).toBe("No subtitle");
  });

  it("shows 'No scene info' when there's no matching moment data", () => {
    render(<CompactSegmentList {...baseProps()} />);
    expect(screen.getAllByText("No scene info")).toHaveLength(2);
  });

  it("shows the shot-type badge and memo when moment data matches", () => {
    const moments: ClipMoments[] = [
      {
        clip: "cut_01.mp4",
        clipSummary: "",
        moments: [{ inS: 0, outS: 5, shotType: "cat", memo: "cat appears", quality: 5 }],
        monotonousRanges: [],
      },
    ];
    render(<CompactSegmentList {...baseProps({ moments })} />);
    expect(screen.getByText("Cat")).not.toBeNull();
    expect(screen.getByText(/cat appears/)).not.toBeNull();
  });

  it("disables Move up on the first row and Move down on the last row", () => {
    render(<CompactSegmentList {...baseProps()} />);
    expect(screen.getAllByTitle("Move up")[0]).toHaveProperty("disabled", true);
    expect(screen.getAllByTitle("Move down")[1]).toHaveProperty("disabled", true);
  });

  it("calls onMove/onRemove/onAdd from their respective buttons", () => {
    const onMove = vi.fn();
    const onRemove = vi.fn();
    const onAdd = vi.fn();
    render(<CompactSegmentList {...baseProps({ onMove, onRemove, onAdd })} />);
    fireEvent.click(screen.getAllByTitle("Move down")[0]!);
    expect(onMove).toHaveBeenCalledWith(0, 1);
    fireEvent.click(screen.getAllByTitle("Delete")[0]!);
    expect(onRemove).toHaveBeenCalledWith(0);
    fireEvent.click(screen.getByText("Duplicate selected cut"));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("shows the BGM count badge and toggles the gutter collapse", () => {
    const bgm: BgmCue[] = [{ file: "bgm.mp3", start: 0, end: 5, volume: 1 }];
    render(<CompactSegmentList {...baseProps({ bgm })} />);
    const toggle = screen.getByTitle("Collapse the background music gutter");
    expect(toggle.textContent).toContain("1");
    expect(screen.getByText("+ Add track")).not.toBeNull();
    fireEvent.click(toggle);
    expect(screen.queryByText("+ Add track")).toBeNull();
  });

  it("calls onAddBgmTrack when + Add track is clicked", () => {
    const onAddBgmTrack = vi.fn();
    render(<CompactSegmentList {...baseProps({ onAddBgmTrack })} />);
    fireEvent.click(screen.getByText("+ Add track"));
    expect(onAddBgmTrack).toHaveBeenCalledTimes(1);
  });
});
