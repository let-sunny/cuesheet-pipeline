// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SubtitleStyle, SubtitleStylePresets } from "@cuesheet/schema";
import { SubtitleStylePresetsSettings } from "./SubtitleStylePresetsSettings.js";

afterEach(cleanup);

// The "Editing" target select (Astryx Selector) opens its option list via the Popover API, which
// jsdom doesn't implement - mocked the same minimal way SubtitleGroup.test.tsx/HeaderBar.test.tsx
// do, so fireEvent.click on the trigger actually reveals the options.
beforeEach(() => {
  HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
    this.setAttribute("popover-open", "");
  });
  HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
    this.removeAttribute("popover-open");
  });
});

const globalStyle: SubtitleStyle = {
  font: "Pretendard",
  size: 36,
  color: "#ffffff",
  outlineColor: "#000000",
  outlineWidth: 3,
  position: "bottom",
  margin: 40,
};

function baseProps(overrides: Partial<Parameters<typeof SubtitleStylePresetsSettings>[0]> = {}) {
  return {
    subtitleStyle: globalStyle,
    onSubtitleStyleChange: vi.fn(),
    presets: undefined,
    onCreate: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    onChangePreset: vi.fn(),
    projectWidth: 1920,
    projectHeight: 1080,
    previewClip: undefined as string | undefined,
    previewClipTimeS: 0,
    ...overrides,
  };
}

/**
 * Renders against a real presets state (create/rename/delete/edit actually mutate it and
 * re-render), rather than plain vi.fn() stubs - needed for the flows below that depend on the
 * component's own effect that reverts the "Editing" target back to Global once the target it was
 * pointed at stops existing in `presets` (this mirrors how FinishStep really feeds this component
 * via useFinishStepActions, where a rename/delete really does update the cuesheet).
 */
function renderStateful(initialPresets: SubtitleStylePresets = {}) {
  function Harness() {
    const [presets, setPresets] = useState<SubtitleStylePresets>(initialPresets);
    return (
      <SubtitleStylePresetsSettings
        subtitleStyle={globalStyle}
        onSubtitleStyleChange={() => {}}
        presets={presets}
        onCreate={(name) => setPresets((prev) => ({ ...prev, [name]: {} }))}
        onRename={(oldName, newName) =>
          setPresets((prev) => {
            const { [oldName]: value, ...rest } = prev;
            return { ...rest, [newName]: value ?? {} };
          })
        }
        onDelete={(name) =>
          setPresets((prev) => {
            const { [name]: _removed, ...rest } = prev;
            return rest;
          })
        }
        onChangePreset={(name, patch) =>
          setPresets((prev) => ({ ...prev, [name]: { ...prev[name], ...patch } }))
        }
        projectWidth={1920}
        projectHeight={1080}
        previewClip={undefined}
        previewClipTimeS={0}
      />
    );
  }
  return render(<Harness />);
}

function openEditingSelect() {
  fireEvent.click(screen.getByRole("combobox", { name: "Editing" }));
}

describe("SubtitleStylePresetsSettings", () => {
  it("defaults to editing the global style, with no Rename/Delete controls shown", () => {
    render(<SubtitleStylePresetsSettings {...baseProps()} />);
    expect(screen.getByDisplayValue("Pretendard")).not.toBeNull();
    expect(screen.queryByText("Delete preset")).toBeNull();
  });

  it("lists Global plus every preset name as Editing options", () => {
    render(<SubtitleStylePresetsSettings {...baseProps({ presets: { loud: {}, quiet: {} } })} />);
    openEditingSelect();
    expect(screen.getByRole("option", { name: "Global (default)", hidden: true })).not.toBeNull();
    expect(screen.getByRole("option", { name: "loud", hidden: true })).not.toBeNull();
    expect(screen.getByRole("option", { name: "quiet", hidden: true })).not.toBeNull();
  });

  it("editing the global target patches subtitleStyle via onSubtitleStyleChange", () => {
    const onSubtitleStyleChange = vi.fn();
    render(<SubtitleStylePresetsSettings {...baseProps({ onSubtitleStyleChange })} />);
    fireEvent.change(screen.getByDisplayValue("Pretendard"), { target: { value: "Inter" } });
    expect(onSubtitleStyleChange).toHaveBeenCalledWith({ font: "Inter" });
  });

  it("selecting a preset shows its merged values (falling back to global) and Rename/Delete controls", () => {
    render(<SubtitleStylePresetsSettings {...baseProps({ presets: { loud: { size: 60 } } })} />);
    openEditingSelect();
    fireEvent.click(screen.getByRole("option", { name: "loud", hidden: true }));

    // size is overridden (60), font falls back to the global value (Pretendard).
    expect(screen.getByDisplayValue("60")).not.toBeNull();
    expect(screen.getByDisplayValue("Pretendard")).not.toBeNull();
    expect(screen.getByDisplayValue("loud")).not.toBeNull();
    expect(screen.getByText("Delete preset")).not.toBeNull();
  });

  it("editing a preset target patches via onChangePreset with the preset name", () => {
    const onChangePreset = vi.fn();
    render(<SubtitleStylePresetsSettings {...baseProps({ presets: { loud: {} }, onChangePreset })} />);
    openEditingSelect();
    fireEvent.click(screen.getByRole("option", { name: "loud", hidden: true }));

    // Size goes through useNumericField (transient text, committed on blur/Enter - see that
    // hook's file comment), so a bare change event alone doesn't yet call back.
    const sizeInput = screen.getByDisplayValue("36");
    fireEvent.change(sizeInput, { target: { value: "60" } });
    fireEvent.blur(sizeInput);
    expect(onChangePreset).toHaveBeenCalledWith("loud", { size: 60 });
  });

  it("New preset prompts for a name, creates it, and switches to editing it", () => {
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("shout");
    renderStateful();

    fireEvent.click(screen.getByText("New preset"));
    expect(screen.getByDisplayValue("shout")).not.toBeNull();
    expect(screen.getByText("Delete preset")).not.toBeNull();

    promptSpy.mockRestore();
  });

  it("New preset guards against an empty or duplicate name (no preset created)", () => {
    renderStateful({ loud: {} });

    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("   ");
    fireEvent.click(screen.getByText("New preset"));
    expect(screen.queryByText("Delete preset")).toBeNull();

    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    promptSpy.mockReturnValue("loud");
    fireEvent.click(screen.getByText("New preset"));
    expect(alertSpy).toHaveBeenCalled();
    expect(screen.queryByText("Delete preset")).toBeNull();

    promptSpy.mockRestore();
    alertSpy.mockRestore();
  });

  it("renames on blur, keeps editing the renamed preset, then deletes it", () => {
    renderStateful({ loud: {}, quiet: {} });
    openEditingSelect();
    fireEvent.click(screen.getByRole("option", { name: "quiet", hidden: true }));

    const nameInput = screen.getByDisplayValue("quiet");
    fireEvent.change(nameInput, { target: { value: "shout" } });
    fireEvent.blur(nameInput);
    // Renamed - still editing the same preset, now under its new name.
    expect(screen.getByDisplayValue("shout")).not.toBeNull();

    fireEvent.click(screen.getByText("Delete preset"));
    // Deleted - the target no longer exists, so the view falls back to Global.
    expect(screen.queryByText("Delete preset")).toBeNull();
  });

  it("falls back to the global target once the edited preset no longer exists", () => {
    const { rerender } = render(
      <SubtitleStylePresetsSettings {...baseProps({ presets: { loud: {} } })} />,
    );
    openEditingSelect();
    fireEvent.click(screen.getByRole("option", { name: "loud", hidden: true }));
    expect(screen.getByText("Delete preset")).not.toBeNull();

    rerender(<SubtitleStylePresetsSettings {...baseProps({ presets: undefined })} />);
    expect(screen.queryByText("Delete preset")).toBeNull();
  });
});
