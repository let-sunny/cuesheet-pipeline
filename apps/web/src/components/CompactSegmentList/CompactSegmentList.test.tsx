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

  it("positions a BGM bar's top/height relative to the gutter container's own box, not each row's raw offsetTop", () => {
    // Regression test (QA finding 2026-07-10): a bar's `top` CSS is interpreted relative to the
    // `bgm-gutter` container's own box (it's `position: relative`, the bar's containing block),
    // but row divs live in a separate DOM branch (`.list`, a flex sibling of the gutter) - using
    // raw `el.offsetTop` (relative to whatever ancestor happens to be positioned, often far above
    // both) silently double-counted the gutter's own page-level offset into every bar's position.
    // Mocking getBoundingClientRect per element (keyed by data-testid) simulates real on-screen
    // positions without relying on jsdom layout (which doesn't compute one) - the gutter and cut
    // rows are given the same non-zero page-level top (500) they'd share in real layout (both are
    // flex siblings starting flush at the same content edge), so a correct implementation must
    // produce top:0 for a bar covering row 0, not top:500.
    const rectByTestId: Record<string, { top: number; height: number }> = {
      "bgm-gutter": { top: 500, height: 400 },
      "cut-row-0": { top: 500, height: 120 },
      "cut-row-1": { top: 620, height: 120 },
      "cut-row-2": { top: 740, height: 120 },
    };
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      const rect = rectByTestId[this.getAttribute("data-testid") ?? ""];
      const top = rect?.top ?? 0;
      const height = rect?.height ?? 0;
      return {
        top,
        bottom: top + height,
        height,
        left: 0,
        right: 0,
        width: 0,
        x: 0,
        y: top,
        toJSON: () => ({}),
      } as DOMRect;
    };

    try {
      // 3 segments of 5s each (cumulative cut starts 0/5/10/15) - a bgm cue spanning seconds 0-10
      // covers cuts 0-1 (rows 0-1).
      const bgm: BgmCue[] = [{ file: "bgm.mp3", start: 0, end: 10, volume: 1 }];
      render(
        <CompactSegmentList
          {...baseProps({
            segments: [
              segment({ in: 0, out: 5 }),
              segment({ in: 5, out: 10 }),
              segment({ in: 10, out: 15 }),
            ],
            bgm,
          })}
        />,
      );

      const bar = screen.getByTestId("bgm-bar-0");
      // Correct: row0.top (500) - gutter.top (500) = 0. The pre-fix, offsetTop-based computation
      // would have produced 500 here instead (double-counting the gutter's own page offset).
      expect(bar.style.top).toBe("0px");
      // bottom = row1.top(620) + row1.height(120) - gutter.top(500) = 240.
      expect(bar.style.height).toBe("240px");
    } finally {
      HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    }
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
