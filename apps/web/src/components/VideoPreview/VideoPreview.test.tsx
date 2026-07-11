// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Segment, SubtitleStyle } from "@cuesheet/schema";
import type { ClipMoments, ProxyStatus } from "../../api.js";
import { VideoPreview } from "./VideoPreview.js";

vi.mock("../../api.js", () => ({
  fetchProxyStatus: vi.fn(async () => ({ pending: [], generating: null }) as ProxyStatus),
  captureFrame: vi.fn(async () => ({ ok: true }) as const),
}));

import { fetchProxyStatus } from "../../api.js";

// TrimStrip is heavy (its own drag/zoom/ResizeObserver-driven filmstrip logic, already covered by
// TrimStrip.test.tsx) - stubbed here so this file can focus on VideoPreview's own conditional
// rendering (scene info, missing-source/proxy states, playmode toggle) instead of re-testing it.
vi.mock("../TrimStrip/index.js", () => ({
  TrimStrip: () => <div data-testid="trim-strip-stub" />,
}));

afterEach(cleanup);

beforeAll(() => {
  // jsdom doesn't implement HTMLMediaElement.play()/pause() - VideoPreview's effects call these.
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
    in: 1,
    out: 3,
    speed: 1,
    volume: 1,
    subtitle: "hello",
    ...overrides,
  };
}

function baseProps(overrides: Partial<Parameters<typeof VideoPreview>[0]> = {}) {
  return {
    segment: seg(),
    selectedIndex: 0,
    onChange: vi.fn(),
    onSplit: vi.fn(),
    moments: [] as ClipMoments[],
    subtitleStyle,
    subtitleStylePresets: undefined,
    projectHeight: 1080,
    projectWidth: 1920,
    ...overrides,
  };
}

describe("VideoPreview", () => {
  it("shows the empty state when no cut is selected", () => {
    render(<VideoPreview {...baseProps({ segment: undefined })} />);
    expect(screen.getByTestId("video-preview").textContent).toContain("Select a cut");
  });

  it("shows the shot-type badge and scene text for a matched moment", async () => {
    const moments: ClipMoments[] = [
      {
        clip: "cut_01.mp4",
        clipSummary: "",
        moments: [{ inS: 1, outS: 3, shotType: "cat", memo: "the cat shows up", quality: 4 }],
        monotonousRanges: [],
      },
    ];
    render(<VideoPreview {...baseProps({ moments })} />);
    await waitFor(() => expect(screen.getByText("the cat shows up")).not.toBeNull());
    expect(screen.getByText("Cat")).not.toBeNull();
  });

  it("falls back to 'No scene info' (with the empty-scene look) when nothing matches", async () => {
    render(<VideoPreview {...baseProps({ moments: [] })} />);
    await waitFor(() => expect(screen.getByText("No scene info")).not.toBeNull());
  });

  it("shows the missing-source message when the segment has no clip filename", async () => {
    render(<VideoPreview {...baseProps({ segment: seg({ clip: "" }) })} />);
    await waitFor(() => expect(screen.getByText(/Can't find the source/)).not.toBeNull());
  });

  it("shows the missing-source message when the video errors and the supplementary fetch 404s (Finding 3)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    const { container } = render(<VideoPreview {...baseProps()} />);
    const video = container.querySelector("video")!;
    video.dispatchEvent(new Event("error"));
    await waitFor(() => expect(screen.getByText("Can't find the source: cut_01.mp4")).not.toBeNull());
    vi.unstubAllGlobals();
  });

  it("shows a distinct undecodable-file message when the video errors but the file actually exists (Finding 3)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 200 })),
    );
    const { container } = render(<VideoPreview {...baseProps()} />);
    const video = container.querySelector("video")!;
    video.dispatchEvent(new Event("error"));
    await waitFor(() =>
      expect(screen.getByText(/can't be played as video/)).not.toBeNull(),
    );
    expect(screen.queryByText(/Can't find the source/)).toBeNull();
    vi.unstubAllGlobals();
  });

  it("shows a preparing-video notice while the clip's proxy is still generating", async () => {
    vi.mocked(fetchProxyStatus).mockResolvedValueOnce({ pending: [], generating: "cut_01.mp4" });
    render(<VideoPreview {...baseProps()} />);
    await waitFor(() => expect(screen.getByText(/Preparing video/)).not.toBeNull());
    expect(screen.getByText(/processing now/)).not.toBeNull();
  });

  it("flips the play/pause control's label and action with the video's actual play state (2026-07-11 QA fix - previously stuck on Play, with no way to pause from the button)", async () => {
    const { container } = render(<VideoPreview {...baseProps()} />);
    const video = container.querySelector("video")!;
    const button = screen.getByTestId("video-control-play");
    expect(button.textContent).toBe("Play");

    fireEvent.click(button);
    // jsdom's play()/pause() stubs (see beforeAll above) don't dispatch play/pause events on their
    // own the way a real browser does - dispatch it manually to simulate that, same pattern as the
    // video error-event tests above (which likewise await the resulting state update via waitFor).
    video.dispatchEvent(new Event("play"));
    await waitFor(() => expect(screen.getByTestId("video-control-play").textContent).toBe("Pause"));

    fireEvent.click(screen.getByTestId("video-control-play"));
    video.dispatchEvent(new Event("pause"));
    await waitFor(() => expect(screen.getByTestId("video-control-play").textContent).toBe("Play"));
  });

  it("toggles the active playmode button between Loop range and Full clip", () => {
    render(<VideoPreview {...baseProps()} />);
    const loopButton = screen.getByTestId("video-playmode-loop");
    const freeButton = screen.getByTestId("video-playmode-free");
    expect(loopButton.className).toContain("active");
    expect(freeButton.className).not.toContain("active");

    fireEvent.click(freeButton);
    expect(freeButton.className).toContain("active");
    expect(loopButton.className).not.toContain("active");
  });

  it("disables Split near the cut's edges (with a tooltip), and enables it once the playhead moves away (2026-07-11 QA fix)", async () => {
    const { container } = render(<VideoPreview {...baseProps({ segment: seg({ in: 1, out: 3 }) })} />);
    const video = container.querySelector("video")!;
    const splitButton = screen.getByTestId("video-control-split");

    // Before any timeupdate, currentTime is still 0 (well outside [1, 3]) - the exact scenario the
    // fix targets: the head starts too close to (in this case, before) the cut's own edge.
    expect(splitButton.getAttribute("aria-disabled")).toBe("true");

    Object.defineProperty(video, "currentTime", { value: 2, writable: true });
    video.dispatchEvent(new Event("timeupdate"));
    await waitFor(() => expect(screen.getByTestId("video-control-split").getAttribute("aria-disabled")).toBeNull());

    Object.defineProperty(video, "currentTime", { value: 1.1, writable: true });
    video.dispatchEvent(new Event("timeupdate"));
    await waitFor(() =>
      expect(screen.getByTestId("video-control-split").getAttribute("aria-disabled")).toBe("true"),
    );
  });

  it("shows a Reframe entry button in the video toolbar that enters crop edit mode, hiding itself while active (2026-07-11 QA fix - reframe moved off the cut-settings panel)", () => {
    render(<VideoPreview {...baseProps()} />);
    const reframeButton = screen.getByTestId("video-control-reframe");
    expect(reframeButton.textContent).toBe("Reframe");

    fireEvent.click(reframeButton);
    // Entering crop edit mode swaps the toolbar entry button out for the in-progress edit toolbar
    // (Full frame/Apply/Cancel), so there's only ever one reframe-related control visible.
    expect(screen.queryByTestId("video-control-reframe")).toBeNull();
    expect(screen.getByText("Apply")).not.toBeNull();
  });
});
