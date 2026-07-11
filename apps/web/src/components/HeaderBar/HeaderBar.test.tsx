// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HeaderBar } from "./HeaderBar.js";

afterEach(cleanup);

// Selector (Astryx) opens its option list via the Popover API, which jsdom doesn't implement -
// mocked the same minimal way Astryx's own Selector.test.tsx does, so fireEvent.click on the
// trigger actually reveals the options in these tests.
beforeEach(() => {
  HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
    this.setAttribute("popover-open", "");
  });
  HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
    this.removeAttribute("popover-open");
  });
});

function baseProps() {
  return {
    projectName: "My Project",
    onProjectNameChange: vi.fn(),
    dirty: false,
    saving: false,
    rendering: false,
    renderProgress: null,
    renderDisabled: false,
    canUndo: true,
    canRedo: true,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onSave: vi.fn(),
    onRender: vi.fn(),
    themeMode: "light" as const,
    onThemeModeChange: vi.fn(),
    themeName: "y2k" as const,
    onThemeNameChange: vi.fn(),
    onToggleShortcuts: vi.fn(),
  };
}

describe("HeaderBar", () => {
  it("shows the project name, falling back to a placeholder when empty", () => {
    render(<HeaderBar {...baseProps()} projectName="" />);
    expect(screen.getByText("(no name)")).not.toBeNull();
  });

  it("clicking the title enters edit mode with an input pre-filled with the current name", () => {
    render(<HeaderBar {...baseProps()} projectName="My Project" />);
    fireEvent.click(screen.getByTestId("project-title"));
    const input = screen.getByTestId("project-title-input") as HTMLInputElement;
    expect(input.value).toBe("My Project");
  });

  it("typing and pressing Enter commits the new name", () => {
    const onProjectNameChange = vi.fn();
    render(<HeaderBar {...baseProps()} projectName="My Project" onProjectNameChange={onProjectNameChange} />);
    fireEvent.click(screen.getByTestId("project-title"));
    const input = screen.getByTestId("project-title-input") as HTMLInputElement;
    // The Enter handler calls e.currentTarget.blur() - jsdom only fires a real blur event if the
    // element is actually focused, so focus it first (as a real user would, by clicking into it).
    input.focus();
    fireEvent.change(input, { target: { value: "New Name" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onProjectNameChange).toHaveBeenCalledWith("New Name");
    expect(screen.queryByTestId("project-title-input")).toBeNull();
  });

  it("blurring without pressing Enter also commits the new name", () => {
    const onProjectNameChange = vi.fn();
    render(<HeaderBar {...baseProps()} projectName="My Project" onProjectNameChange={onProjectNameChange} />);
    fireEvent.click(screen.getByTestId("project-title"));
    const input = screen.getByTestId("project-title-input");
    fireEvent.change(input, { target: { value: "Renamed" } });
    fireEvent.blur(input);
    expect(onProjectNameChange).toHaveBeenCalledWith("Renamed");
  });

  it("pressing Escape cancels the edit without committing", () => {
    const onProjectNameChange = vi.fn();
    render(<HeaderBar {...baseProps()} projectName="My Project" onProjectNameChange={onProjectNameChange} />);
    fireEvent.click(screen.getByTestId("project-title"));
    const input = screen.getByTestId("project-title-input");
    fireEvent.change(input, { target: { value: "Discarded" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onProjectNameChange).not.toHaveBeenCalled();
    expect(screen.getByTestId("project-title").textContent).toBe("My Project");
  });

  it("rejects an empty/whitespace-only name, reverting to the previous name", () => {
    const onProjectNameChange = vi.fn();
    render(<HeaderBar {...baseProps()} projectName="My Project" onProjectNameChange={onProjectNameChange} />);
    fireEvent.click(screen.getByTestId("project-title"));
    const input = screen.getByTestId("project-title-input");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.blur(input);
    expect(onProjectNameChange).not.toHaveBeenCalled();
    expect(screen.getByTestId("project-title").textContent).toBe("My Project");
  });

  it("shows the dirty badge only while dirty", () => {
    const { rerender } = render(<HeaderBar {...baseProps()} dirty={false} />);
    expect(screen.queryByText("● Unsaved")).toBeNull();
    rerender(<HeaderBar {...baseProps()} dirty />);
    expect(screen.getByText("● Unsaved")).not.toBeNull();
  });

  it("disables Undo/Redo based on canUndo/canRedo and fires their handlers", () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    render(<HeaderBar {...baseProps()} canUndo={false} canRedo onUndo={onUndo} onRedo={onRedo} />);
    // Undo/Redo are icon-only buttons; Astryx marks their disabled state with aria-disabled (they
    // stay focusable) rather than the native `disabled` attribute.
    expect(screen.getByRole("button", { name: "Undo" }).getAttribute("aria-disabled")).toBe("true");
    const redo = screen.getByRole("button", { name: "Redo" });
    expect(redo.getAttribute("aria-disabled")).not.toBe("true");
    fireEvent.click(redo);
    expect(onRedo).toHaveBeenCalledTimes(1);
  });

  it("shows Saving… while saving and disables Save", () => {
    render(<HeaderBar {...baseProps()} saving />);
    const save = screen.getByRole("button", { name: "Saving…" });
    expect(save.hasAttribute("disabled")).toBe(true);
  });

  it("shows export progress while rendering and calls onRender on click", () => {
    const onRender = vi.fn();
    render(<HeaderBar {...baseProps()} rendering renderProgress={42} onRender={onRender} />);
    const exportButton = screen.getByRole("button", { name: "Exporting… 42%" });
    fireEvent.click(exportButton);
    expect(onRender).toHaveBeenCalledTimes(1);
  });

  it("disables Export when renderDisabled is true", () => {
    render(<HeaderBar {...baseProps()} renderDisabled />);
    expect(screen.getByRole("button", { name: "Export" }).hasAttribute("disabled")).toBe(true);
  });

  it("calls onSave when Save is clicked", () => {
    const onSave = vi.fn();
    render(<HeaderBar {...baseProps()} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("calls onToggleShortcuts when the [?] button is clicked", () => {
    const onToggleShortcuts = vi.fn();
    render(<HeaderBar {...baseProps()} onToggleShortcuts={onToggleShortcuts} />);
    fireEvent.click(screen.getByRole("button", { name: "?" }));
    expect(onToggleShortcuts).toHaveBeenCalledTimes(1);
  });

  it("theme toggle calls onThemeModeChange with the clicked mode", () => {
    const onThemeModeChange = vi.fn();
    render(<HeaderBar {...baseProps()} themeMode="light" onThemeModeChange={onThemeModeChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(onThemeModeChange).toHaveBeenCalledWith("dark");
  });

  it("marks the current theme mode's segment as selected (aria-checked) and others not", () => {
    render(<HeaderBar {...baseProps()} themeMode="light" />);
    expect(screen.getByRole("radio", { name: "Light" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "Dark" }).getAttribute("aria-checked")).toBe("false");
  });

  it("renders the theme switcher with all 3 theme options (Stone/Y2K/Neutral)", () => {
    render(<HeaderBar {...baseProps()} themeName="y2k" />);
    fireEvent.click(screen.getByTestId("theme-switcher"));
    expect(screen.getByRole("option", { name: "Stone", hidden: true })).not.toBeNull();
    expect(screen.getByRole("option", { name: "Y2K", hidden: true })).not.toBeNull();
    expect(screen.getByRole("option", { name: "Neutral", hidden: true })).not.toBeNull();
  });

  it("theme switcher calls onThemeNameChange when a different theme is picked", () => {
    const onThemeNameChange = vi.fn();
    render(<HeaderBar {...baseProps()} themeName="y2k" onThemeNameChange={onThemeNameChange} />);
    fireEvent.click(screen.getByTestId("theme-switcher"));
    fireEvent.click(screen.getByRole("option", { name: "Stone", hidden: true }));
    expect(onThemeNameChange).toHaveBeenCalledWith("stone");
  });
});
