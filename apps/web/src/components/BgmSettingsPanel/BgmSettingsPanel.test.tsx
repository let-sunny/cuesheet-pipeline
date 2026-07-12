// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { BgmCue } from "@cuesheet/schema";
import { BgmSettingsPanel } from "./BgmSettingsPanel.js";

// jsdom doesn't implement HTMLMediaElement.play() - stub it so the preview button doesn't throw.
beforeAll(() => {
  HTMLMediaElement.prototype.play = () => Promise.resolve();
  HTMLMediaElement.prototype.pause = () => {};
});

// The File dropdown (Astryx Selector) opens its option list via the Popover API, which jsdom
// doesn't implement - mocked the same minimal way SelectField.test.tsx does.
beforeEach(() => {
  HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
    this.setAttribute("popover-open", "");
  });
  HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
    this.removeAttribute("popover-open");
  });
});

afterEach(cleanup);

function baseCue(): BgmCue {
  return { file: "media/bgm/track1.mp3", start: 0, end: 10, volume: 0.5 };
}

function baseProps() {
  return {
    cue: baseCue(),
    bgmIndex: 0,
    startCutIdx: 0,
    endCutIdx: 2,
    startSeconds: 0,
    endSeconds: 10,
    cutCount: 5,
    files: [
      { path: "media/bgm/track1.mp3", durationS: 30 },
      { path: "media/bgm/track2.mp3", durationS: 45 },
    ],
    filesNote: undefined as string | undefined,
    onChangeFile: vi.fn(),
    onChangeRange: vi.fn(),
    onChangeVolume: vi.fn(),
    onRemove: vi.fn(),
    onClose: vi.fn(),
  };
}

describe("BgmSettingsPanel", () => {
  it("shows the panel title with the 1-based track index", () => {
    render(<BgmSettingsPanel {...baseProps()} />);
    expect(screen.getByText("Background music track 1")).not.toBeNull();
  });

  it("shows the currently assigned file in the File dropdown", () => {
    render(<BgmSettingsPanel {...baseProps()} />);
    expect(screen.getByTestId("bgm-field-file").textContent).toContain("track1.mp3");
  });

  it("calls onChangeFile when another file is picked from the dropdown", () => {
    const onChangeFile = vi.fn();
    render(<BgmSettingsPanel {...baseProps()} onChangeFile={onChangeFile} />);
    fireEvent.click(screen.getByTestId("bgm-field-file"));
    fireEvent.click(screen.getByRole("option", { name: /track2\.mp3/, hidden: true }));
    expect(onChangeFile).toHaveBeenCalledWith("media/bgm/track2.mp3");
  });

  it("shows the empty-state note when there are no candidate files", () => {
    render(<BgmSettingsPanel {...baseProps()} files={[]} filesNote="No audio files found" />);
    expect(screen.getByText("No audio files found")).not.toBeNull();
  });

  it("shows the seconds summary for the current range", () => {
    render(<BgmSettingsPanel {...baseProps()} />);
    expect(screen.getByText("0.0s-10.0s")).not.toBeNull();
  });

  it("calls onRemove when Remove track is clicked", () => {
    const onRemove = vi.fn();
    render(<BgmSettingsPanel {...baseProps()} onRemove={onRemove} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove track" }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    render(<BgmSettingsPanel {...baseProps()} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Close background music settings" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
