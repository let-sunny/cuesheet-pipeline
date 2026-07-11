// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SelectField } from "./SelectField.js";

afterEach(cleanup);

// Selector (Astryx) opens its option list via the Popover API, which jsdom doesn't implement -
// mocked the same minimal way Astryx's own Selector.test.tsx does (also used by
// HeaderBar.test.tsx in this app), so fireEvent.click on the trigger actually reveals the options.
beforeEach(() => {
  HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
    this.setAttribute("popover-open", "");
  });
  HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
    this.removeAttribute("popover-open");
  });
});

const OPTIONS = [
  { value: "", label: "(none)" },
  { value: "typing", label: "Typing" },
  { value: "gooey", label: "Gooey" },
];

describe("SelectField", () => {
  it("renders the label and currently selected option", () => {
    render(<SelectField label="Preset" value="typing" options={OPTIONS} onChange={() => {}} testId="preset-select" />);
    expect(screen.getByTestId("preset-select").textContent).toContain("Typing");
    expect(screen.getByRole("combobox", { name: "Preset" })).not.toBeNull();
  });

  it("calls onChange with the clicked option's value", () => {
    const onChange = vi.fn();
    render(<SelectField label="Preset" value="typing" options={OPTIONS} onChange={onChange} testId="preset-select" />);
    fireEvent.click(screen.getByTestId("preset-select"));
    fireEvent.click(screen.getByRole("option", { name: "Gooey", hidden: true }));
    expect(onChange).toHaveBeenCalledWith("gooey");
  });
});
