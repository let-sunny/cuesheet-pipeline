// @vitest-environment jsdom
import type { ComponentProps } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Segment } from "@cuesheet/schema";
import type { ClipMoments } from "../../api.js";
import { KNITTING_DOMAIN_CONFIG } from "../../../test/lib/knittingDomainConfig.js";
import { CompactSegmentList } from "./CompactSegmentList.js";

// The domain config (shot labels/badge colors) is fetched once via context (issue #31 item 1) -
// stubbed here to the knitting fixture so this test keeps asserting the exact same knitting
// shot-type labels the old hardcoded maps produced.
vi.mock("../../hooks/useDomainConfig.js", () => ({
  useDomainConfig: () => ({ config: KNITTING_DOMAIN_CONFIG, loaded: true }),
}));

// jsdom doesn't implement scrollIntoView (the selected-row-scroll effect) - stub it so
// rendering doesn't throw.
beforeAll(() => {
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
    onRemove: vi.fn(),
    onMove: vi.fn(),
    bgmDragHighlight: null,
    onRowRectsChange: vi.fn(),
    ...overrides,
  };
}

describe("CompactSegmentList", () => {
  it("renders one row per segment with its 1-based index", () => {
    render(<CompactSegmentList {...baseProps()} />);
    expect(screen.getByText("1")).not.toBeNull();
    expect(screen.getByText("2")).not.toBeNull();
  });

  it("renders no thumbnail image in a cut row (2026-07-11 QA fix - subtitle/scene text + the right-side VideoPreview already identify the cut)", () => {
    render(<CompactSegmentList {...baseProps()} />);
    const row = screen.getByTestId("cut-row-0");
    expect(row.querySelector("img")).toBeNull();
  });

  it("marks the selected row (className carries the selected variant)", () => {
    render(<CompactSegmentList {...baseProps({ selectedIndex: 1 })} />);
    const selectedRow = screen.getByTestId("cut-row-1");
    const unselectedRow = screen.getByTestId("cut-row-0");
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

  it("flags only cuts with no subtitle yet (a todo dot), leaving subtitled cuts unmarked", () => {
    render(<CompactSegmentList {...baseProps()} />);
    // Of the two base segments, one has a subtitle and one doesn't - only the empty one gets a dot.
    const dots = document.querySelectorAll('[title="No subtitle yet"]');
    expect(dots).toHaveLength(1);
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
    expect(screen.getAllByRole("button", { name: "Move up" })[0]).toHaveProperty("disabled", true);
    expect(screen.getAllByRole("button", { name: "Move down" })[1]).toHaveProperty("disabled", true);
  });

  it("calls onMove/onRemove from their respective row buttons", () => {
    const onMove = vi.fn();
    const onRemove = vi.fn();
    render(<CompactSegmentList {...baseProps({ onMove, onRemove })} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Move down" })[0]!);
    expect(onMove).toHaveBeenCalledWith(0, 1);
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]!);
    expect(onRemove).toHaveBeenCalledWith(0);
  });

  it("highlights rows within the bgmDragHighlight range (owned by BgmSidePanel, forwarded via EditStep)", () => {
    render(
      <CompactSegmentList
        {...baseProps({
          segments: [segment(), segment(), segment()],
          // selectedIndex 2 is outside the highlighted range so it doesn't also carry
          // rowSelected, which would otherwise make its className differ from row 0/1's.
          selectedIndex: 2,
          bgmDragHighlight: { start: 0, end: 1 },
        })}
      />,
    );
    const highlightedRow0 = screen.getByTestId("cut-row-0");
    const highlightedRow1 = screen.getByTestId("cut-row-1");
    const plainRow2 = screen.getByTestId("cut-row-2");
    expect(highlightedRow0.className).toEqual(highlightedRow1.className);
    expect(highlightedRow0.className).not.toEqual(plainRow2.className);
  });

  it("reports each row's measured rect via onRowRectsChange", () => {
    const onRowRectsChange = vi.fn();
    render(<CompactSegmentList {...baseProps({ onRowRectsChange })} />);
    expect(onRowRectsChange).toHaveBeenCalled();
    const lastCall = onRowRectsChange.mock.calls[onRowRectsChange.mock.calls.length - 1]![0];
    expect(lastCall).toHaveLength(2);
    expect(lastCall[0]).toEqual(expect.objectContaining({ top: expect.any(Number), height: expect.any(Number) }));
  });

  it("caps the row subtitle textarea at a 2-line height (rows=2) even with a 500-char subtitle", () => {
    const longSubtitle = "가나다라마바사아자차카타파하 ".repeat(34); // ~500 chars, Korean
    render(
      <CompactSegmentList
        {...baseProps({ segments: [segment({ subtitle: longSubtitle }), segment()] })}
      />,
    );
    const textarea = screen.getByTestId("cut-row-subtitle-0") as HTMLTextAreaElement;
    expect(longSubtitle.length).toBeGreaterThan(400);
    expect(textarea.getAttribute("rows")).toBe("2");
    // No JS-driven inline height is set on the element (the 2-line cap is a static CSS rule, not
    // content-dependent auto-grow) - a long subtitle must not push an inline style height onto it.
    expect(textarea.style.height).toBe("");
  });

  it("leaves the row subtitle textarea's rows/height constraint unaffected for short subtitles", () => {
    render(<CompactSegmentList {...baseProps()} />);
    const textarea = screen.getByTestId("cut-row-subtitle-0") as HTMLTextAreaElement;
    expect(textarea.getAttribute("rows")).toBe("2");
    expect(textarea.style.height).toBe("");
  });

  it("caps the row subtitle textarea at 2 lines for a long unbroken Latin string too", () => {
    const longLatin = "a".repeat(500);
    render(
      <CompactSegmentList
        {...baseProps({ segments: [segment({ subtitle: longLatin }), segment()] })}
      />,
    );
    const textarea = screen.getByTestId("cut-row-subtitle-0") as HTMLTextAreaElement;
    expect(textarea.getAttribute("rows")).toBe("2");
    expect(textarea.style.height).toBe("");
  });
});
