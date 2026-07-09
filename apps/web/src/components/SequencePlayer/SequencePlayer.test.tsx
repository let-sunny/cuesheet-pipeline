// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ClipMoments } from "../../api.js";
import type { CueSheet, Segment, SubtitleStyle } from "@cuesheet/schema";
import { SequencePlayer } from "./SequencePlayer.js";

// useSequenceAudio drives BGM/narration playback (its own <audio> element lifecycle, already
// covered by its own hook-level tests) - stubbed here so this file can focus on SequencePlayer's
// own conditional rendering (subtitle/scene-hint/ended state, speed toggle).
vi.mock("../../hooks/useSequenceAudio.js", () => ({
  useSequenceAudio: () => {},
}));

afterEach(cleanup);

beforeAll(() => {
  HTMLMediaElement.prototype.play = () => Promise.resolve();
  HTMLMediaElement.prototype.pause = () => {};
});

const subtitleStyle: SubtitleStyle = {
  position: "bottom",
  color: "#fff",
  font: "sans-serif",
  size: 36,
  outlineWidth: 2,
  outlineColor: "#000",
  margin: 40,
  background: null,
};

function seg(overrides: Partial<Segment> = {}): Segment {
  return {
    clip: "cut_01.mp4",
    in: 0,
    out: 2,
    speed: 1,
    volume: 1,
    subtitle: "hello there",
    ...overrides,
  };
}

function cue(segments: Segment[]): CueSheet {
  return {
    project: { name: "test", fps: 30, width: 1920, height: 1080 },
    clipDir: "/clips",
    intro: null,
    outro: null,
    segments,
    bgm: [],
    subtitleStyle,
  };
}

function baseProps(overrides: Partial<Parameters<typeof SequencePlayer>[0]> = {}) {
  const segments = [seg()];
  return {
    segments,
    cue: cue(segments),
    narrationFiles: [],
    currentIndex: 0,
    moments: [] as ClipMoments[],
    subtitleStyle,
    subtitleStylePresets: undefined,
    projectHeight: 1080,
    projectWidth: 1920,
    onIndexChange: vi.fn(),
    onExit: vi.fn(),
    ...overrides,
  };
}

describe("SequencePlayer", () => {
  it("renders the current cut's subtitle", () => {
    render(<SequencePlayer {...baseProps()} />);
    expect(screen.getByTestId("sequence-subtitle").textContent).toContain("hello there");
  });

  it("shows the scene hint when the current cut matches a moment", () => {
    const moments: ClipMoments[] = [
      {
        clip: "cut_01.mp4",
        clipSummary: "",
        moments: [{ inS: 0, outS: 2, shotType: "object", memo: "a finished sock", quality: 4 }],
        monotonousRanges: [],
      },
    ];
    render(<SequencePlayer {...baseProps({ moments })} />);
    expect(screen.getByTitle("a finished sock")).not.toBeNull();
  });

  it("shows the End state once past the last cut", () => {
    render(<SequencePlayer {...baseProps({ currentIndex: 1 })} />);
    expect(screen.getByText("End")).not.toBeNull();
  });

  it("shows the cut counter for the current index", () => {
    const segments = [seg(), seg({ clip: "cut_02.mp4", in: 0, out: 1 })];
    render(<SequencePlayer {...baseProps({ segments, cue: cue(segments), currentIndex: 1 })} />);
    expect(screen.getByText(/Cut 2\/2/)).not.toBeNull();
  });

  it("switches the active speed-toggle button when a rate is clicked", () => {
    render(<SequencePlayer {...baseProps()} />);
    const oneX = screen.getByText("1x");
    const oneAndHalfX = screen.getByText("1.5x");
    expect(oneX.className).toContain("active");
    expect(oneAndHalfX.className).not.toContain("active");

    fireEvent.click(oneAndHalfX);
    expect(oneAndHalfX.className).toContain("active");
    expect(oneX.className).not.toContain("active");
  });

  it("calls onExit when Close is clicked", () => {
    const onExit = vi.fn();
    render(<SequencePlayer {...baseProps({ onExit })} />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onExit).toHaveBeenCalledOnce();
  });
});
