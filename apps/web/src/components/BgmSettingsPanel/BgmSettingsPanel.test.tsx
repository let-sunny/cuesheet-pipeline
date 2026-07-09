// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { BgmCue } from "@cuesheet/schema";
import { BgmSettingsPanel } from "./BgmSettingsPanel.js";

// jsdom doesn't implement HTMLMediaElement.play() - stub it so the preview button doesn't throw.
beforeAll(() => {
  HTMLMediaElement.prototype.play = () => Promise.resolve();
  HTMLMediaElement.prototype.pause = () => {};
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
  };
}

describe("BgmSettingsPanel", () => {
  it("shows the panel title with the 1-based track index", () => {
    render(<BgmSettingsPanel {...baseProps()} />);
    expect(screen.getByText("Background music track 1")).not.toBeNull();
  });

  it("marks the currently assigned file's row as selected", () => {
    render(<BgmSettingsPanel {...baseProps()} />);
    const row = screen.getByText(/track1\.mp3/).closest("div")!;
    expect(row.className).toContain("selected");
    const otherRow = screen.getByText(/track2\.mp3/).closest("div")!;
    expect(otherRow.className).not.toContain("selected");
  });

  it("calls onChangeFile when a candidate file's name is clicked", () => {
    const onChangeFile = vi.fn();
    render(<BgmSettingsPanel {...baseProps()} onChangeFile={onChangeFile} />);
    fireEvent.click(screen.getByText(/track2\.mp3/));
    expect(onChangeFile).toHaveBeenCalledWith("media/bgm/track2.mp3");
  });

  it("shows the empty-state note when there are no candidate files", () => {
    render(<BgmSettingsPanel {...baseProps()} files={[]} filesNote="No audio files found" />);
    expect(screen.getByText("No audio files found")).not.toBeNull();
  });

  it("shows the cuts/seconds summary for the current range", () => {
    render(<BgmSettingsPanel {...baseProps()} />);
    expect(screen.getByText("Cuts 1-3 · 0.0s-10.0s")).not.toBeNull();
  });

  it("calls onRemove when Remove track is clicked", () => {
    const onRemove = vi.fn();
    render(<BgmSettingsPanel {...baseProps()} onRemove={onRemove} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove track" }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
