// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TitlePreview } from "./TitlePreview.js";
import type { TitlePreviewProps } from "./TitlePreview.js";

afterEach(cleanup);

/**
 * Full manual control over rAF + performance.now(), same technique as useTitleFrameLoop's own
 * unit test (which covers the rAF/anchor math in isolation) - here it's only used to prove the
 * frame this component renders actually advances end-to-end (hook -> TitleCardView -> DOM),
 * without racing a real timer.
 */
let pending: Map<number, FrameRequestCallback>;
let nextId: number;
let nowValue: number;

beforeEach(() => {
  pending = new Map();
  nextId = 0;
  nowValue = 0;
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((cb: FrameRequestCallback) => {
      nextId += 1;
      pending.set(nextId, cb);
      return nextId;
    }),
  );
  vi.stubGlobal(
    "cancelAnimationFrame",
    vi.fn((id: number) => {
      pending.delete(id);
    }),
  );
  vi.spyOn(performance, "now").mockImplementation(() => nowValue);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function tick(now: number) {
  nowValue = now;
  const [id, cb] = [...pending.entries()][0] ?? [undefined, undefined];
  if (id !== undefined) {
    pending.delete(id);
  }
  act(() => {
    cb?.(now);
  });
}

const baseProps: TitlePreviewProps = {
  text: "Cast on today",
  preset: "fade",
  color: "#3a3128",
  fontSize: 72,
  durationInFrames: 300,
  fps: 30,
  projectWidth: 1920,
  projectHeight: 1080,
  playing: true,
  restartToken: 0,
};

describe("TitlePreview", () => {
  it("renders the real TitleCardView composition (the title's text appears in the DOM)", () => {
    render(<TitlePreview {...baseProps} />);
    expect(screen.getByTestId("title-preview")).not.toBeNull();
    expect(screen.getByText("Cast on today")).not.toBeNull();
  });

  it("advances the frame over time while playing (the typing preset reveals more characters)", () => {
    render(<TitlePreview {...baseProps} preset="typing" durationInFrames={60} />);
    // Frame 0: nothing revealed yet.
    expect(screen.queryByText("Cast on today")).toBeNull();

    tick(500); // 0.5s * 30fps = frame 15 -> chars/2 = 7 characters shown ("Cast on")
    expect(screen.getByText("Cast on", { exact: false })).not.toBeNull();
  });

  it("stops advancing while paused", () => {
    const { rerender } = render(<TitlePreview {...baseProps} preset="typing" durationInFrames={60} playing={true} />);
    tick(500);
    expect(screen.getByText("Cast on", { exact: false })).not.toBeNull();

    rerender(<TitlePreview {...baseProps} preset="typing" durationInFrames={60} playing={false} />);
    tick(1000);
    // Nothing further was revealed - the rAF loop never scheduled/ran while paused.
    expect(screen.queryByText(/Cast on today/)).toBeNull();
  });

  it("restart (a restartToken bump) resets playback back to frame 0", () => {
    const { rerender } = render(<TitlePreview {...baseProps} preset="typing" durationInFrames={60} restartToken={0} />);
    tick(500);
    expect(screen.getByText("Cast on", { exact: false })).not.toBeNull();

    rerender(<TitlePreview {...baseProps} preset="typing" durationInFrames={60} restartToken={1} />);
    expect(screen.queryByText("Cast on", { exact: false })).toBeNull();
  });
});
