// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ColorField } from "./ColorField.js";

afterEach(cleanup);

describe("ColorField", () => {
  it("renders the label and both the color swatch input and the hex text input at the given value", () => {
    render(<ColorField label="Color" inputID="c1" value="#ff0000" onChange={() => {}} />);
    expect(screen.getByLabelText("Color")).toHaveProperty("value", "#ff0000");
    expect(screen.getByLabelText("Color (hex)")).toHaveProperty("value", "#ff0000");
  });

  it("calls onChange with the typed hex value", () => {
    const onChange = vi.fn();
    render(<ColorField label="Color" inputID="c1" value="#ff0000" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Color (hex)"), { target: { value: "#00ff00" } });
    expect(onChange).toHaveBeenCalledWith("#00ff00");
  });

  it("calls onChange with the picked color value", () => {
    const onChange = vi.fn();
    render(<ColorField label="Color" inputID="c1" value="#ff0000" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Color"), { target: { value: "#0000ff" } });
    expect(onChange).toHaveBeenCalledWith("#0000ff");
  });
});
