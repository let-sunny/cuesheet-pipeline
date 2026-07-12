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
    render(
      <TitleGroup
        title={undefined}
        onToggle={vi.fn()}
        onChangeTitle={vi.fn()}
        titleDurationField={numericField("3")}
        titleSizeField={numericField("72")}
      />,
    );
    expect(screen.queryByText("Preset")).toBeNull();
    expect(screen.queryByText(/Backdrop dim/)).toBeNull();
  });

  it("calls onToggle when the checkbox is clicked", () => {
    const onToggle = vi.fn();
    render(
      <TitleGroup
        title={undefined}
        onToggle={onToggle}
        onChangeTitle={vi.fn()}
        titleDurationField={numericField("3")}
        titleSizeField={numericField("72")}
      />,
    );
    fireEvent.click(screen.getByLabelText("Title card for this cut"));
    expect(onToggle.mock.calls[0]?.[0]).toBe(true);
  });

  it("renders the detail fields once a title is set, with its current values", () => {
    const title: Title = { text: "hi", preset: "typing", durationS: 3, color: "#3a3128", size: 72, highlightColor: "#a7c7e7" };
    render(
      <TitleGroup
        title={title}
        onToggle={vi.fn()}
        onChangeTitle={vi.fn()}
        titleDurationField={numericField("3")}
        titleSizeField={numericField("72")}
      />,
    );
    expect(screen.getByDisplayValue("hi")).not.toBeNull();
    expect(screen.getByText("Preset")).not.toBeNull();
    // The slider's value is folded into its own label (2026-07-09 diagnosed fix), not a bare
    // group name - default backdrop dim is 0% before any change.
    expect(screen.getByText("Backdrop dim (0%)")).not.toBeNull();
    // Both the native color picker and the hex text input share the same value ("#3a3128"), so
    // the hex input is selected specifically by its accessible label (see ColorField's aria-label).
    expect((screen.getByLabelText("Color (hex)") as HTMLInputElement).value).toBe("#3a3128");
    expect(screen.getByDisplayValue("72")).not.toBeNull();
  });

  it("shows the Highlight color field only for the highlight preset, and edits it", () => {
    const onChangeTitle = vi.fn();
    const { rerender } = render(
      <TitleGroup
        title={{ text: "hi", preset: "typing", durationS: 3, color: "#3a3128", size: 72, highlightColor: "#a7c7e7" }}
        onToggle={vi.fn()}
        onChangeTitle={onChangeTitle}
        titleDurationField={numericField("3")}
        titleSizeField={numericField("72")}
      />,
    );
    // Not the highlight preset -> no Highlight color field.
    expect(screen.queryByLabelText("Highlight (hex)")).toBeNull();

    rerender(
      <TitleGroup
        title={{ text: "hi", preset: "highlight", durationS: 3, color: "#3a3128", size: 72, highlightColor: "#a7c7e7" }}
        onToggle={vi.fn()}
        onChangeTitle={onChangeTitle}
        titleDurationField={numericField("3")}
        titleSizeField={numericField("72")}
      />,
    );
    const hex = screen.getByLabelText("Highlight (hex)") as HTMLInputElement;
    expect(hex.value).toBe("#a7c7e7");
    fireEvent.change(hex, { target: { value: "#ff0000" } });
    expect(onChangeTitle).toHaveBeenCalledWith({ highlightColor: "#ff0000" });
  });

  it("calls onChangeTitle when the text field changes", () => {
    const onChangeTitle = vi.fn();
    const title: Title = { text: "hi", preset: "typing", durationS: 3, color: "#3a3128", size: 72, highlightColor: "#a7c7e7" };
    render(
      <TitleGroup
        title={title}
        onToggle={vi.fn()}
        onChangeTitle={onChangeTitle}
        titleDurationField={numericField("3")}
        titleSizeField={numericField("72")}
      />,
    );
    fireEvent.change(screen.getByTestId("cut-field-title-text"), { target: { value: "bye" } });
    expect(onChangeTitle).toHaveBeenCalledWith({ text: "bye" });
  });

  it("calls onChangeTitle when the color field changes", () => {
    const onChangeTitle = vi.fn();
    const title: Title = { text: "hi", preset: "typing", durationS: 3, color: "#3a3128", size: 72, highlightColor: "#a7c7e7" };
    render(
      <TitleGroup
        title={title}
        onToggle={vi.fn()}
        onChangeTitle={onChangeTitle}
        titleDurationField={numericField("3")}
        titleSizeField={numericField("72")}
      />,
    );
    fireEvent.change(screen.getByLabelText("Color (hex)"), { target: { value: "#ffffff" } });
    expect(onChangeTitle).toHaveBeenCalledWith({ color: "#ffffff" });
  });

  it("calls onChangeTitle when the size field changes", () => {
    const onChangeTitle = vi.fn();
    const title: Title = { text: "hi", preset: "typing", durationS: 3, color: "#3a3128", size: 72, highlightColor: "#a7c7e7" };
    const titleSizeField = numericField("72");
    render(
      <TitleGroup
        title={title}
        onToggle={vi.fn()}
        onChangeTitle={onChangeTitle}
        titleDurationField={numericField("3")}
        titleSizeField={titleSizeField}
      />,
    );
    fireEvent.change(screen.getByTestId("cut-field-title-size"), { target: { value: "96" } });
    expect(titleSizeField.onChange).toHaveBeenCalled();
  });
});
