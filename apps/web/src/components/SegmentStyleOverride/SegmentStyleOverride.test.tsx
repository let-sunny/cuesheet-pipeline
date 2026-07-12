// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Segment, SubtitleStyle } from "@cuesheet/schema";
import { SegmentStyleOverride } from "./SegmentStyleOverride.js";

afterEach(cleanup);

const globalStyle: SubtitleStyle = {
  font: "Pretendard",
  size: 36,
  color: "#ffffff",
  outlineColor: "#000000",
  outlineWidth: 3,
  position: "bottom",
  margin: 40,
};

function baseSegment(overrides?: Partial<Segment>): Segment {
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

function baseProps() {
  return {
    segment: baseSegment(),
    globalStyle,
    onToggle: vi.fn(),
    onChangeOverride: vi.fn(),
    onPromote: vi.fn(),
    onClear: vi.fn(),
  };
}

describe("SegmentStyleOverride", () => {
  it("shows only the toggle (unchecked) when the segment has no override", () => {
    render(<SegmentStyleOverride {...baseProps()} />);
    const checkbox = screen.getByLabelText("Custom style for this cut") as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    expect(screen.queryByText("Style details")).toBeNull() /* title removed */;
  });

  it("calls onToggle when the checkbox is clicked", () => {
    const onToggle = vi.fn();
    render(<SegmentStyleOverride {...baseProps()} onToggle={onToggle} />);
    fireEvent.click(screen.getByLabelText("Custom style for this cut"));
    expect(onToggle.mock.calls[0]?.[0]).toBe(true);
  });

  it("expands the detail fields (falling back to the global style's values) once an override exists", () => {
    const segment = baseSegment({ styleOverride: {} });
    render(<SegmentStyleOverride {...baseProps()} segment={segment} />);
    expect(screen.getByLabelText("Custom style for this cut")).toBeInstanceOf(HTMLInputElement);
    const sizeInput = screen.getByDisplayValue("36") as HTMLInputElement;
    expect(sizeInput).not.toBeNull();
    /* "Style details" title removed 2026-07-11 - override fields show directly on check */
  });

  it("shows the background fields only once the override's background box is on", () => {
    const segment = baseSegment({ styleOverride: {} });
    render(<SegmentStyleOverride {...baseProps()} segment={segment} />);
    expect(screen.queryByText(/Background opacity/)).toBeNull();

    const segmentWithBg = baseSegment({
      styleOverride: { background: { color: "#000000", opacity: 0.75, padding: 8 } },
    });
    render(<SegmentStyleOverride {...baseProps()} segment={segmentWithBg} />);
    // The slider's value is folded into its own label (2026-07-09 diagnosed fix), not a bare
    // group name - see SubtitleStyleSettings.test.tsx's matching case for the full rationale.
    expect(screen.getByText("Background opacity (75%)")).not.toBeNull();
    // Padding is editable per-cut too now (2026-07-12), same as the global panel.
    expect(screen.getByDisplayValue("8")).not.toBeNull();
  });

  it("calls onPromote/onClear from the detail actions", () => {
    const onPromote = vi.fn();
    const onClear = vi.fn();
    const segment = baseSegment({ styleOverride: {} });
    render(<SegmentStyleOverride {...baseProps()} segment={segment} onPromote={onPromote} onClear={onClear} />);
    fireEvent.click(screen.getByRole("button", { name: "Apply to all cuts" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove override" }));
    expect(onPromote).toHaveBeenCalledTimes(1);
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
