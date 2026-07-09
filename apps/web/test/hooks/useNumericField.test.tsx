// @vitest-environment jsdom
import { useState } from "react";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useNumericField } from "../../src/hooks/useNumericField.js";

// @testing-library/react doesn't auto-register cleanup outside of a jest/vitest-globals setup
// file, so each render() here would otherwise leave its DOM tree mounted for the next test,
// breaking single-element queries like getByLabelText.
afterEach(cleanup);

interface HarnessProps {
  onCommit: (n: number) => void;
  coerce?: (n: number) => number;
  onAdjusted?: (typed: number, adjusted: number) => void;
  initial?: number;
  parseTimeShorthand?: boolean;
  step?: number;
  bigStep?: number;
}

function Harness({ onCommit, coerce, onAdjusted, initial = 12, parseTimeShorthand, step, bigStep }: HarnessProps) {
  const [value, setValue] = useState(initial);
  const bindings = useNumericField({
    value,
    onCommit: (n) => {
      setValue(n);
      onCommit(n);
    },
    coerce,
    onAdjusted,
    parseTimeShorthand,
    step,
    bigStep,
  });
  return <input aria-label="numeric" {...bindings} />;
}

describe("useNumericField", () => {
  it("clear-then-type commits the typed value, not a corrupted concatenation (regression)", () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    const input = screen.getByLabelText("numeric") as HTMLInputElement;
    expect(input.value).toBe("12");

    // Clearing the field must NOT immediately snap to a NaN-fallback (the old bug) - it should
    // stay as transient uncommitted text until blur/Enter.
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.change(input, { target: { value: "2.5" } });
    fireEvent.blur(input);

    expect(input.value).toBe("2.5");
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith(2.5);
  });

  it("clamps out-of-range input on blur via coerce, and reports the adjustment", () => {
    const onCommit = vi.fn();
    const onAdjusted = vi.fn();
    const coerce = (n: number) => Math.min(10, Math.max(0, n));
    render(<Harness onCommit={onCommit} coerce={coerce} onAdjusted={onAdjusted} />);
    const input = screen.getByLabelText("numeric") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "999" } });
    fireEvent.blur(input);

    expect(input.value).toBe("10");
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith(10);
    expect(onAdjusted).toHaveBeenCalledOnce();
    expect(onAdjusted).toHaveBeenCalledWith(999, 10);
  });

  it("reverts invalid/empty input to the last committed value without calling onCommit", () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} initial={5} />);
    const input = screen.getByLabelText("numeric") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);

    expect(input.value).toBe("5");
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("Enter commits by blurring the field", () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    const input = screen.getByLabelText("numeric") as HTMLInputElement;

    // The hook's Enter handler calls e.currentTarget.blur() - jsdom only fires a real blur event
    // if the element is actually the focused element, so focus it first (as a real user would).
    input.focus();
    fireEvent.change(input, { target: { value: "7" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(input.value).toBe("7");
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith(7);
  });

  it("ArrowUp/ArrowDown step the committed value by `step` and commit immediately (no blur needed)", () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} initial={10} step={1 / 30} />);
    const input = screen.getByLabelText("numeric") as HTMLInputElement;

    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit.mock.calls[0][0]).toBeCloseTo(10 + 1 / 30, 5);
    expect(Number(input.value)).toBeCloseTo(10 + 1 / 30, 5);

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(onCommit).toHaveBeenCalledTimes(2);
    expect(onCommit.mock.calls[1][0]).toBeCloseTo(10, 5);
  });

  it("Shift+ArrowUp/Down steps by `bigStep` instead of `step`", () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} initial={10} step={1 / 30} bigStep={1} />);
    const input = screen.getByLabelText("numeric") as HTMLInputElement;

    fireEvent.keyDown(input, { key: "ArrowUp", shiftKey: true });
    expect(onCommit).toHaveBeenCalledWith(11);
  });

  it("without `step`, arrow keys are left to native input behavior (no commit)", () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} initial={10} />);
    const input = screen.getByLabelText("numeric") as HTMLInputElement;

    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("parseTimeShorthand: accepts M:SS.s shorthand", () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} initial={0} parseTimeShorthand />);
    const input = screen.getByLabelText("numeric") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "1:23.4" } });
    fireEvent.blur(input);

    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit.mock.calls[0][0]).toBeCloseTo(83.4, 5);
  });

  it("parseTimeShorthand: a leading +/- commits a delta from the current value, not a literal", () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} initial={10} parseTimeShorthand />);
    const input = screen.getByLabelText("numeric") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "-2" } });
    fireEvent.blur(input);

    expect(onCommit).toHaveBeenCalledWith(8);
  });
});
