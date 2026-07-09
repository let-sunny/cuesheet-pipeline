// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Project } from "@cuesheet/schema";
import { RenderSettingsDialog } from "./RenderSettingsDialog.js";

// jsdom doesn't implement the native <dialog> element's showModal()/close() (Astryx's Dialog
// renders a real <dialog> and calls both) - stub them so mounting the dialog open doesn't throw.
// This is the first Dialog-based component test in the repo; no other test needs this yet.
beforeAll(() => {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    };
  }
});

afterEach(cleanup);

function baseProject(): Project {
  return {
    name: "My Project",
    fps: 30,
    width: 1920,
    height: 1080,
  } as Project;
}

function baseProps() {
  return {
    isOpen: true,
    onOpenChange: vi.fn(),
    project: baseProject(),
    dirty: false,
    rendering: false,
    segmentCount: 12,
    outputSeconds: 90,
    noBurnSubtitles: false,
    onToggleNoBurnSubtitles: vi.fn(),
    onChangeResolution: vi.fn(),
    onStartRender: vi.fn(),
  };
}

describe("RenderSettingsDialog", () => {
  it("shows the summary (project name/resolution/cuts/output length)", () => {
    render(<RenderSettingsDialog {...baseProps()} />);
    expect(screen.getByText("Project: My Project")).not.toBeNull();
    expect(screen.getByText("Resolution: 1920x1080")).not.toBeNull();
    expect(screen.getByText("Cuts: 12")).not.toBeNull();
    expect(screen.getByText("Estimated output length: 1:30")).not.toBeNull();
  });

  it("marks the matching resolution preset as active", () => {
    render(<RenderSettingsDialog {...baseProps()} />);
    expect(screen.getByRole("button", { name: "1920x1080" }).className).toContain("active");
    expect(screen.getByRole("button", { name: "1280x720" }).className).not.toContain("active");
  });

  it("calls onChangeResolution when a different preset is clicked", () => {
    const onChangeResolution = vi.fn();
    render(<RenderSettingsDialog {...baseProps()} onChangeResolution={onChangeResolution} />);
    fireEvent.click(screen.getByRole("button", { name: "1280x720" }));
    expect(onChangeResolution).toHaveBeenCalledWith(1280, 720);
  });

  it("shows a custom-resolution note when width/height don't match any preset", () => {
    render(<RenderSettingsDialog {...baseProps()} project={{ ...baseProject(), width: 1000, height: 800 } as Project} />);
    expect(screen.getByText(/Current setting: 1000x800 \(custom\)/)).not.toBeNull();
  });

  it("shows the 4K warning only at 3840x2160", () => {
    const { rerender } = render(<RenderSettingsDialog {...baseProps()} />);
    expect(screen.queryByText(/4K takes much longer/)).toBeNull();
    rerender(<RenderSettingsDialog {...baseProps()} project={{ ...baseProject(), width: 3840, height: 2160 } as Project} />);
    expect(screen.getByText(/4K takes much longer/)).not.toBeNull();
  });

  it("toggles the no-burn-subtitles checkbox", () => {
    const onToggleNoBurnSubtitles = vi.fn();
    render(<RenderSettingsDialog {...baseProps()} onToggleNoBurnSubtitles={onToggleNoBurnSubtitles} />);
    fireEvent.click(screen.getByLabelText("Export without subtitles (for CC)"));
    expect(onToggleNoBurnSubtitles.mock.calls[0]?.[0]).toBe(true);
  });

  it("shows the dirty warning and disables Start export while dirty", () => {
    render(<RenderSettingsDialog {...baseProps()} dirty />);
    expect(screen.getByText(/You have unsaved edits/)).not.toBeNull();
    expect(screen.getByRole("button", { name: "Start export" }).hasAttribute("disabled")).toBe(true);
  });

  it("starts the export and closes the dialog when Start export is clicked", () => {
    const onStartRender = vi.fn();
    const onOpenChange = vi.fn();
    render(<RenderSettingsDialog {...baseProps()} onStartRender={onStartRender} onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Start export" }));
    expect(onStartRender).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes without starting export when Cancel is clicked", () => {
    const onStartRender = vi.fn();
    const onOpenChange = vi.fn();
    render(<RenderSettingsDialog {...baseProps()} onStartRender={onStartRender} onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onStartRender).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows Exporting… and disables Start export while rendering", () => {
    render(<RenderSettingsDialog {...baseProps()} rendering />);
    expect(screen.getByRole("button", { name: "Exporting…" }).hasAttribute("disabled")).toBe(true);
  });
});
