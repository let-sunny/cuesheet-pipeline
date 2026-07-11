// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NumericFieldBindings } from "../../../hooks/useNumericField.js";
import { NumericInput } from "./NumericInput.js";

afterEach(cleanup);

function mockField(value: string): NumericFieldBindings {
  return { value, onChange: vi.fn(), onBlur: vi.fn(), onKeyDown: vi.fn() };
}

describe("NumericInput", () => {
  it("renders a real label associated with the input, showing the field's current text", () => {
    render(<NumericInput field={mockField("3.5")} label="Speed" testId="speed-field" />);
    expect(screen.getByLabelText("Speed")).toHaveProperty("value", "3.5");
    expect(screen.getByTestId("speed-field")).toBe(screen.getByLabelText("Speed"));
  });

  it("fires field.onChange when typed into", () => {
    const field = mockField("1");
    render(<NumericInput field={field} label="Speed" testId="speed-field" />);
    fireEvent.change(screen.getByTestId("speed-field"), { target: { value: "2" } });
    expect(field.onChange).toHaveBeenCalledTimes(1);
  });

  it("fires field.onBlur on blur (the hook's commit point)", () => {
    const field = mockField("1");
    render(<NumericInput field={field} label="Speed" testId="speed-field" />);
    fireEvent.blur(screen.getByTestId("speed-field"));
    expect(field.onBlur).toHaveBeenCalledTimes(1);
  });

  it("fires field.onKeyDown on ArrowUp (the hook's frame-step trigger)", () => {
    const field = mockField("1");
    render(<NumericInput field={field} label="Speed" testId="speed-field" />);
    fireEvent.keyDown(screen.getByTestId("speed-field"), { key: "ArrowUp" });
    expect(field.onKeyDown).toHaveBeenCalledTimes(1);
  });
});
