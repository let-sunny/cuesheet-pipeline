// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Segment } from "@cuesheet/schema";
import type { ClipMoments } from "../api.js";
import { MomentPalette } from "./MomentPalette.js";

vi.mock("../api.js", () => ({
  fetchMoments: vi.fn(),
  fetchDraftFrames: vi.fn(async () => [] as string[]),
}));

import { fetchMoments } from "../api.js";

afterEach(cleanup);

// jsdom has no matchMedia implementation - Astryx's Overlay (used by each card's thumbnail
// composition) reads it to detect touch devices. No other co-located component test has hit this
// yet (this is the first test to render MomentPalette at all), so this stub lives here rather
// than in the shared vitest setup.
window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

const oneCard: ClipMoments[] = [
  {
    clip: "cut_01.mp4",
    clipSummary: "",
    moments: [{ inS: 1, outS: 3, shotType: "hand-closeup", memo: "knitting a sock", quality: 4 }],
    monotonousRanges: [],
  },
];

function baseProps(overrides: Partial<Parameters<typeof MomentPalette>[0]> = {}) {
  return {
    segments: [] as Segment[],
    clipDir: "/clips",
    introPath: null,
    outroPath: null,
    onAddSegment: vi.fn(),
    onRemoveSegment: vi.fn(),
    onSetIntro: vi.fn(),
    onSetOutro: vi.fn(),
    ...overrides,
  };
}

describe("MomentPalette card action toggle", () => {
  it("shows a single 'Add' button (not a pair) when the card isn't in use", async () => {
    vi.mocked(fetchMoments).mockResolvedValue(oneCard);
    render(<MomentPalette {...baseProps()} />);
    await waitFor(() => expect(screen.getByTestId(/palette-card-toggle-/)).not.toBeNull());
    expect(screen.getByText("Add")).not.toBeNull();
    expect(screen.queryByText("Remove")).toBeNull();
  });

  it("calls onAddSegment when Add is clicked", async () => {
    vi.mocked(fetchMoments).mockResolvedValue(oneCard);
    const onAddSegment = vi.fn();
    render(<MomentPalette {...baseProps({ onAddSegment })} />);
    await waitFor(() => expect(screen.getByText("Add")).not.toBeNull());
    fireEvent.click(screen.getByText("Add"));
    expect(onAddSegment).toHaveBeenCalledOnce();
  });

  it("flips to a single 'Remove' button once the card's range is already added", async () => {
    vi.mocked(fetchMoments).mockResolvedValue(oneCard);
    const segments: Segment[] = [{ clip: "cut_01.mp4", in: 1, out: 3, speed: 1, volume: 1, subtitle: "" }];
    render(<MomentPalette {...baseProps({ segments })} />);
    await waitFor(() => expect(screen.getByText("Remove")).not.toBeNull());
    expect(screen.queryByText("Add")).toBeNull();

    const onRemoveSegment = vi.fn();
    cleanup();
    render(<MomentPalette {...baseProps({ segments, onRemoveSegment })} />);
    await waitFor(() => expect(screen.getByText("Remove")).not.toBeNull());
    fireEvent.click(screen.getByText("Remove"));
    expect(onRemoveSegment).toHaveBeenCalledWith("cut_01.mp4", 1, 3);
  });

  it("shows the shortened Set intro/Set outro labels", async () => {
    vi.mocked(fetchMoments).mockResolvedValue(oneCard);
    render(<MomentPalette {...baseProps()} />);
    await waitFor(() => expect(screen.getByText("Set intro")).not.toBeNull());
    expect(screen.getByText("Set outro")).not.toBeNull();
    expect(screen.queryByText("Set as intro")).toBeNull();
    expect(screen.queryByText("Set as outro")).toBeNull();
  });
});
