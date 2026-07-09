// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SubtitleStyle } from "@cuesheet/schema";
import { SubtitleStylePresetsSettings } from "./SubtitleStylePresetsSettings.js";

afterEach(cleanup);

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
    presets: undefined,
    globalStyle,
    onCreate: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    onChangePreset: vi.fn(),
    ...overrides,
  };
}

describe("SubtitleStylePresetsSettings", () => {
  it("shows the empty-state note when there are no presets", () => {
    render(<SubtitleStylePresetsSettings {...baseProps()} />);
    expect(screen.getByText("No presets yet - create one below.")).not.toBeNull();
  });

  it("renders one row per existing preset, with its name field", () => {
    render(<SubtitleStylePresetsSettings {...baseProps({ presets: { loud: {}, quiet: {} } })} />);
    expect(screen.getByDisplayValue("loud")).not.toBeNull();
    expect(screen.getByDisplayValue("quiet")).not.toBeNull();
  });

  it("disables Create preset until a non-empty, non-duplicate name is typed", () => {
    render(<SubtitleStylePresetsSettings {...baseProps({ presets: { loud: {} } })} />);
    const button = screen.getByText("Create preset").closest("button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    fireEvent.change(screen.getByPlaceholderText("e.g. inner-voice"), { target: { value: "loud" } });
    expect(button.disabled).toBe(true);

    fireEvent.change(screen.getByPlaceholderText("e.g. inner-voice"), { target: { value: "shout" } });
    expect(button.disabled).toBe(false);
  });

  it("calls onCreate with the typed name and clears the input", () => {
    const onCreate = vi.fn();
    render(<SubtitleStylePresetsSettings {...baseProps({ onCreate })} />);
    const input = screen.getByPlaceholderText("e.g. inner-voice") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "shout" } });
    fireEvent.click(screen.getByText("Create preset"));
    expect(onCreate).toHaveBeenCalledWith("shout");
    expect(input.value).toBe("");
  });

  it("calls onDelete for the right preset", () => {
    const onDelete = vi.fn();
    render(<SubtitleStylePresetsSettings {...baseProps({ presets: { loud: {}, quiet: {} }, onDelete })} />);
    const deleteButtons = screen.getAllByText("Delete");
    fireEvent.click(deleteButtons[1]!);
    expect(onDelete).toHaveBeenCalledWith("quiet");
  });

  it("renames on blur when the name field changed", () => {
    const onRename = vi.fn();
    render(<SubtitleStylePresetsSettings {...baseProps({ presets: { loud: {} }, onRename })} />);
    const nameInput = screen.getByDisplayValue("loud");
    fireEvent.change(nameInput, { target: { value: "shout" } });
    fireEvent.blur(nameInput);
    expect(onRename).toHaveBeenCalledWith("loud", "shout");
  });
});
