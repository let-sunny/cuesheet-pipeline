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
}

function Harness({ onCommit, coerce, onAdjusted, initial = 12 }: HarnessProps) {
  const [value, setValue] = useState(initial);
  const bindings = useNumericField({
    value,
    onCommit: (n) => {
      setValue(n);
      onCommit(n);
    },
    coerce,
    onAdjusted,
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
});
