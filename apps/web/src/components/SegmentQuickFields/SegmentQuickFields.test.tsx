// @vitest-environment jsdom
import type { ComponentProps } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Segment, SubtitleStyle } from "@cuesheet/schema";
import { SegmentQuickFields } from "./SegmentQuickFields.js";

afterEach(cleanup);

function segment(overrides: Partial<Segment> = {}): Segment {
  return {
    clip: "cut_01.mp4",
    in: 2,
    out: 9,
    speed: 1,
    volume: 1,
    subtitle: "hello",
    ...overrides,
  } as Segment;
}

const globalSubtitleStyle: SubtitleStyle = {
  size: 40,
  color: "#ffffff",
  position: "bottom",
} as SubtitleStyle;

function baseProps(overrides: Partial<ComponentProps<typeof SegmentQuickFields>> = {}) {
  return {
    segment: segment(),
    narrationEnabled: false,
    narrationFiles: [],
    narrationNote: undefined,
    narrationDir: undefined,
    onChange: vi.fn(),
    clipDurationS: 10,
    onSetIntro: vi.fn(),
    onSetOutro: vi.fn(),
    onClearCrop: vi.fn(),
    onEditCrop: vi.fn(),
    mergeEligibility: { eligible: true } as const,
    onMergeNext: vi.fn(),
    onSplit: vi.fn(),
    onDuplicate: vi.fn(),
    onDelete: vi.fn(),
    canDelete: true,
    globalSubtitleStyle,
    subtitleStylePresets: undefined,
    projectWidth: 1080,
    projectFps: 30,
    onToggleStyleOverride: vi.fn(),
    onChangeStyleOverride: vi.fn(),
    onPromoteStyleOverride: vi.fn(),
    onClearStyleOverride: vi.fn(),
    onChangeStylePreset: vi.fn(),
    onToggleTitle: vi.fn(),
    onChangeTitle: vi.fn(),
    onToggleTransition: vi.fn(),
    onChangeTransition: vi.fn(),
    ...overrides,
  };
}

describe("SegmentQuickFields", () => {
  it("renders nothing when there's no selected segment", () => {
    const { container } = render(<SegmentQuickFields {...baseProps({ segment: undefined })} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows the clip filename read-only", () => {
    render(<SegmentQuickFields {...baseProps()} />);
    expect(screen.getByTitle("cut_01.mp4")).not.toBeNull();
  });

  it("shows the computed cut length", () => {
    render(<SegmentQuickFields {...baseProps()} />);
    expect(screen.getByText("Length 7.0s")).not.toBeNull();
  });

  it("shows the speed-cap note only at 16x", () => {
    const { rerender } = render(<SegmentQuickFields {...baseProps({ segment: segment({ speed: 2 }) })} />);
    expect(screen.queryByText(/Speed is capped at 16x/)).toBeNull();
    rerender(<SegmentQuickFields {...baseProps({ segment: segment({ speed: 16 }) })} />);
    expect(screen.queryByText(/Speed is capped at 16x/)).not.toBeNull();
  });

  it("does not render the Title card fields until the toggle is on", () => {
    render(<SegmentQuickFields {...baseProps()} />);
    expect(screen.queryByText("Preset")).toBeNull();
    expect(screen.queryByText(/Backdrop dim/)).toBeNull();
  });

  it("renders Title card fields once segment.title is set", () => {
    render(
      <SegmentQuickFields
        {...baseProps({
          segment: segment({ title: { text: "hi", preset: "typing", durationS: 3 } as never }),
        })}
      />,
    );
    expect(screen.getByText("Preset")).not.toBeNull();
    // The slider's value is folded into its own label (2026-07-09 diagnosed fix) - no backdrop
    // set yet, so it defaults to 0%.
    expect(screen.getByText("Backdrop dim (0%)")).not.toBeNull();
  });

  it("calls onToggleTitle when the Title card checkbox is toggled", () => {
    const onToggleTitle = vi.fn();
    render(<SegmentQuickFields {...baseProps({ onToggleTitle })} />);
    fireEvent.click(screen.getByLabelText("Title card for this cut"));
    // CheckboxInput's onChange forwards (checked, event) - only the first argument is this
    // component's concern.
    expect(onToggleTitle.mock.calls[0]?.[0]).toBe(true);
  });

  it("renders transition fields only once transitionIn/transitionOut are set, and shows Dip amount only for type dip", () => {
    render(
      <SegmentQuickFields
        {...baseProps({
          segment: segment({
            transitionIn: { type: "dip", durationS: 0.5, dim: 0.5 } as never,
          }),
        })}
      />,
    );
    // The slider's value is folded into its own label (2026-07-09 diagnosed fix), not a bare
    // group name.
    expect(screen.getByText("Dip amount (50%)")).not.toBeNull();
  });

  it("does not show Dip amount for a fade transition", () => {
    render(
      <SegmentQuickFields
        {...baseProps({
          segment: segment({ transitionIn: { type: "fade", durationS: 0.5 } as never }),
        })}
      />,
    );
    expect(screen.queryByText(/Dip amount/)).toBeNull();
  });

  it("hides the Narration group when narrationEnabled is false", () => {
    render(<SegmentQuickFields {...baseProps({ narrationEnabled: false })} />);
    expect(screen.queryByText("Narration")).toBeNull();
  });

  it("shows the Narration group and the empty-state note when narrationEnabled but no files", () => {
    render(
      <SegmentQuickFields
        {...baseProps({ narrationEnabled: true, narrationFiles: [], narrationNote: "Set a narration folder" })}
      />,
    );
    expect(screen.getByText("Narration")).not.toBeNull();
    expect(screen.getByText("Set a narration folder")).not.toBeNull();
  });

  it("shows the narration duration warning when the selected file outlasts the cut", () => {
    render(
      <SegmentQuickFields
        {...baseProps({
          narrationEnabled: true,
          narrationFiles: [{ name: "voice1.mp3", durationS: 30 }],
          segment: segment({ narration: "voice1.mp3" }),
        })}
      />,
    );
    expect(screen.getByText(/longer than the cut/)).not.toBeNull();
  });

  it("shows crop status and Clear only when a crop is applied", () => {
    const { rerender } = render(<SegmentQuickFields {...baseProps()} />);
    expect(screen.getByText("Not applied")).not.toBeNull();
    expect(screen.queryByText("Clear")).toBeNull();

    rerender(<SegmentQuickFields {...baseProps({ segment: segment({ crop: { x: 0, y: 0, w: 1, h: 1 } }) })} />);
    expect(screen.getByText("Applied")).not.toBeNull();
    expect(screen.getByText("Clear")).not.toBeNull();
  });

  it("disables Merge with next cut when ineligible, with the reason as its tooltip", () => {
    render(
      <SegmentQuickFields
        {...baseProps({ mergeEligibility: { eligible: false, reason: "Only one cut left" } })}
      />,
    );
    // Astryx's Button uses aria-disabled (not the native disabled attribute) whenever a tooltip
    // is present, so the button stays focusable for keyboard users to reach the tooltip.
    const button = screen.getByText("Merge with next cut").closest("button")!;
    expect(button.getAttribute("aria-disabled")).toBe("true");
  });

  it("disables Delete when canDelete is false", () => {
    render(<SegmentQuickFields {...baseProps({ canDelete: false })} />);
    const button = screen.getByText("Delete").closest("button")!;
    expect(button.getAttribute("aria-disabled")).toBe("true");
  });

  it("disables Set as intro/outro when the clip is too long", () => {
    render(<SegmentQuickFields {...baseProps({ clipDurationS: 900 })} />);
    expect(screen.getByText("Set as intro").closest("button")!.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText("Set as outro").closest("button")!.getAttribute("aria-disabled")).toBe("true");
  });

  it("calls onChange when the subtitle textarea changes", () => {
    const onChange = vi.fn();
    render(<SegmentQuickFields {...baseProps({ onChange })} />);
    fireEvent.change(screen.getByDisplayValue("hello"), { target: { value: "updated" } });
    expect(onChange).toHaveBeenCalledWith({ subtitle: "updated" });
  });

  it("In/Out: ArrowUp steps by 1/fps (not a hardcoded 1/30), Shift+ArrowUp steps by 1s", () => {
    const onChange = vi.fn();
    render(<SegmentQuickFields {...baseProps({ onChange, projectFps: 24, segment: segment({ in: 2 }) })} />);
    const inField = screen.getByTestId("cut-field-in");

    fireEvent.keyDown(inField, { key: "ArrowUp" });
    expect(onChange).toHaveBeenCalledOnce();
    expect((onChange.mock.calls[0]![0] as { in: number }).in).toBeCloseTo(2 + 1 / 24, 5);

    onChange.mockClear();
    fireEvent.keyDown(inField, { key: "ArrowUp", shiftKey: true });
    expect(onChange).toHaveBeenCalledWith({ in: 3 });
  });

  it("In/Out: a leading -/+ in the typed text commits a delta from the current value", () => {
    const onChange = vi.fn();
    render(<SegmentQuickFields {...baseProps({ onChange, segment: segment({ out: 9 }) })} />);
    const outField = screen.getByTestId("cut-field-out");

    fireEvent.change(outField, { target: { value: "-1.5" } });
    fireEvent.blur(outField);
    expect(onChange).toHaveBeenCalledWith({ out: 7.5 });
  });

  it("In/Out: accepts M:SS.s shorthand", () => {
    const onChange = vi.fn();
    render(<SegmentQuickFields {...baseProps({ onChange })} />);
    const inField = screen.getByTestId("cut-field-in");

    fireEvent.change(inField, { target: { value: "1:02.5" } });
    fireEvent.blur(inField);
    expect(onChange).toHaveBeenCalledWith({ in: 62.5 });
  });
});
