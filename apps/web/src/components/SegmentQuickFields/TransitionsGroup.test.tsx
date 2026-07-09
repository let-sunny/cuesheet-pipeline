// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Transition } from "@cuesheet/schema";
import { TransitionsGroup } from "./TransitionsGroup.js";

afterEach(cleanup);

function numericField(value: string) {
  return { value, onChange: vi.fn(), onBlur: vi.fn(), onKeyDown: vi.fn() };
}

function baseProps(overrides: Partial<Parameters<typeof TransitionsGroup>[0]> = {}) {
  return {
    transitionIn: undefined,
    transitionOut: undefined,
    onToggle: vi.fn(),
    onChangeTransition: vi.fn(),
    transitionInDurationField: numericField("0.5"),
    transitionOutDurationField: numericField("0.5"),
    crossValidationNote: null,
    ...overrides,
  };
}

describe("TransitionsGroup", () => {
  it("renders fields for transitionIn/transitionOut only once each is set", () => {
    render(<TransitionsGroup {...baseProps()} />);
    expect(screen.queryByText("Type")).toBeNull();

    const transitionIn: Transition = { type: "fade", durationS: 0.5 };
    render(<TransitionsGroup {...baseProps({ transitionIn })} />);
    expect(screen.getAllByText("Type").length).toBe(1);
  });

  it("shows Dip amount only for a dip transition, not fade", () => {
    const fade: Transition = { type: "fade", durationS: 0.5 };
    const { rerender } = render(<TransitionsGroup {...baseProps({ transitionIn: fade })} />);
    expect(screen.queryByText(/Dip amount/)).toBeNull();

    const dip: Transition = { type: "dip", durationS: 0.5, dim: 0.5 };
    rerender(<TransitionsGroup {...baseProps({ transitionIn: dip })} />);
    // The slider's value is folded into its own label (2026-07-09 diagnosed fix), not a bare
    // group name.
    expect(screen.getByText("Dip amount (50%)")).not.toBeNull();
  });

  it("calls onToggle for the correct side", () => {
    const onToggle = vi.fn();
    render(<TransitionsGroup {...baseProps({ onToggle })} />);
    fireEvent.click(screen.getByLabelText("Transition in"));
    fireEvent.click(screen.getByLabelText("Transition out"));
    expect(onToggle).toHaveBeenNthCalledWith(1, "in", true);
    expect(onToggle).toHaveBeenNthCalledWith(2, "out", true);
  });

  it("shows the cross-validation note only when provided", () => {
    const { rerender } = render(<TransitionsGroup {...baseProps()} />);
    expect(screen.queryByText(/clamped/)).toBeNull();
    rerender(<TransitionsGroup {...baseProps({ crossValidationNote: "Transition durations clamped to fit the cut" })} />);
    expect(screen.getByText(/clamped/)).not.toBeNull();
  });
});
