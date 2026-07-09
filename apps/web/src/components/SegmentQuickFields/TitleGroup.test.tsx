// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Title } from "@cuesheet/schema";
import { TitleGroup } from "./TitleGroup.js";

afterEach(cleanup);

function numericField(value: string) {
  return { value, onChange: vi.fn(), onBlur: vi.fn(), onKeyDown: vi.fn() };
}

describe("TitleGroup", () => {
  it("does not render the detail fields until a title exists", () => {
    render(<TitleGroup title={undefined} onToggle={vi.fn()} onChangeTitle={vi.fn()} titleDurationField={numericField("3")} />);
    expect(screen.queryByText("Preset")).toBeNull();
    expect(screen.queryByText("Backdrop dim")).toBeNull();
  });

  it("calls onToggle when the checkbox is clicked", () => {
    const onToggle = vi.fn();
    render(<TitleGroup title={undefined} onToggle={onToggle} onChangeTitle={vi.fn()} titleDurationField={numericField("3")} />);
    fireEvent.click(screen.getByLabelText("Title card for this cut"));
    expect(onToggle.mock.calls[0]?.[0]).toBe(true);
  });

  it("renders the detail fields once a title is set, with its current values", () => {
    const title: Title = { text: "hi", preset: "typing", durationS: 3 };
    render(<TitleGroup title={title} onToggle={vi.fn()} onChangeTitle={vi.fn()} titleDurationField={numericField("3")} />);
    expect(screen.getByDisplayValue("hi")).not.toBeNull();
    expect(screen.getByText("Preset")).not.toBeNull();
    expect(screen.getByText("Backdrop dim")).not.toBeNull();
  });

  it("calls onChangeTitle when the text field changes", () => {
    const onChangeTitle = vi.fn();
    const title: Title = { text: "hi", preset: "typing", durationS: 3 };
    render(<TitleGroup title={title} onToggle={vi.fn()} onChangeTitle={onChangeTitle} titleDurationField={numericField("3")} />);
    fireEvent.change(screen.getByTestId("cut-field-title-text"), { target: { value: "bye" } });
    expect(onChangeTitle).toHaveBeenCalledWith({ text: "bye" });
  });
});
