// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Segment, SubtitleStyle } from "@cuesheet/schema";
import { SubtitleGroup } from "./SubtitleGroup.js";

afterEach(cleanup);

// Style preset (Astryx Selector) opens its option list via the Popover API, which jsdom doesn't
// implement - mocked the same minimal way Astryx's own Selector.test.tsx does (also used by
// HeaderBar.test.tsx in this app), so fireEvent.click on the trigger actually reveals the options.
beforeEach(() => {
  HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
    this.setAttribute("popover-open", "");
  });
  HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
    this.removeAttribute("popover-open");
  });
});

const globalSubtitleStyle: SubtitleStyle = {
  font: "Pretendard",
  size: 36,
  color: "#ffffff",
  outlineColor: "#000000",
  outlineWidth: 3,
  position: "bottom",
  margin: 40,
};

function baseSegment(overrides: Partial<Segment> = {}): Segment {
  return { clip: "cut_01.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "hello", ...overrides };
}

function baseProps(overrides: Partial<Parameters<typeof SubtitleGroup>[0]> = {}) {
  return {
    segment: baseSegment(),
    subtitleWarning: null,
    subtitleStylePresets: undefined,
    onChangeSubtitle: vi.fn(),
    onChangeStylePreset: vi.fn(),
    globalSubtitleStyle,
    onToggleStyleOverride: vi.fn(),
    onChangeStyleOverride: vi.fn(),
    onPromoteStyleOverride: vi.fn(),
    onClearStyleOverride: vi.fn(),
    ...overrides,
  };
}

describe("SubtitleGroup", () => {
  it("calls onChangeSubtitle when the textarea changes", () => {
    const onChangeSubtitle = vi.fn();
    render(<SubtitleGroup {...baseProps({ onChangeSubtitle })} />);
    fireEvent.change(screen.getByDisplayValue("hello"), { target: { value: "updated" } });
    expect(onChangeSubtitle).toHaveBeenCalledWith("updated");
  });

  it("shows the subtitle warning only when provided", () => {
    const { rerender } = render(<SubtitleGroup {...baseProps()} />);
    expect(screen.queryByText("too long")).toBeNull();
    rerender(<SubtitleGroup {...baseProps({ subtitleWarning: "too long" })} />);
    expect(screen.getByText("too long")).not.toBeNull();
  });

  it("hides the Style preset select when there are no presets", () => {
    render(<SubtitleGroup {...baseProps({ subtitleStylePresets: undefined })} />);
    expect(screen.queryByText("Style preset")).toBeNull();
  });

  it("shows the Style preset select once presets exist, and calls onChangeStylePreset", () => {
    const onChangeStylePreset = vi.fn();
    render(
      <SubtitleGroup
        {...baseProps({ subtitleStylePresets: { loud: {}, quiet: {} }, onChangeStylePreset })}
      />,
    );
    fireEvent.click(screen.getByRole("combobox", { name: "Style preset" }));
    fireEvent.click(screen.getByRole("option", { name: "loud", hidden: true }));
    expect(onChangeStylePreset).toHaveBeenCalledWith("loud");
  });

  it("renders the per-cut SegmentStyleOverride toggle", () => {
    render(<SubtitleGroup {...baseProps()} />);
    expect(screen.getByLabelText("Custom style for this cut")).not.toBeNull();
  });
});
