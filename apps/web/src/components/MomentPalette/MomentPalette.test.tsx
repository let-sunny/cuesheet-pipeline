// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Segment } from "@cuesheet/schema";
import type { ClipMoments } from "../../api.js";
import { MomentPalette } from "./MomentPalette.js";

vi.mock("../../api.js", () => ({
  fetchMoments: vi.fn(),
  fetchDraftFrames: vi.fn(async () => [] as string[]),
}));

import { fetchMoments } from "../../api.js";

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

describe("MomentPalette load states", () => {
  it("shows a loading message before moments resolve", () => {
    vi.mocked(fetchMoments).mockReturnValue(new Promise(() => {}));
    render(<MomentPalette {...baseProps()} />);
    expect(screen.getByText("Loading scene candidates…")).not.toBeNull();
  });

  it("shows an error message if moments fail to load", async () => {
    vi.mocked(fetchMoments).mockRejectedValue(new Error("network down"));
    render(<MomentPalette {...baseProps()} />);
    await waitFor(() => expect(screen.getByText(/Couldn't load scene candidates/)).not.toBeNull());
    expect(screen.getByText(/network down/)).not.toBeNull();
  });

  it("shows the empty-state guidance when there are no scene candidates", async () => {
    vi.mocked(fetchMoments).mockResolvedValue([]);
    render(<MomentPalette {...baseProps()} />);
    await waitFor(() => expect(screen.getByText(/No scene candidates yet/)).not.toBeNull());
  });
});

describe("MomentPalette collapse toggle", () => {
  it("hides the card grid once collapsed, and restores it on Expand", async () => {
    vi.mocked(fetchMoments).mockResolvedValue(oneCard);
    render(<MomentPalette {...baseProps()} />);
    await waitFor(() => expect(screen.getByText("Add")).not.toBeNull());

    fireEvent.click(screen.getByText("Collapse"));
    expect(screen.queryByText("Add")).toBeNull();
    expect(screen.getByText("Expand")).not.toBeNull();

    fireEvent.click(screen.getByText("Expand"));
    expect(screen.getByText("Add")).not.toBeNull();
  });
});

describe("MomentPalette auto-exclusion banner", () => {
  it("shows a face-exposure banner for a face-tagged card and still allows Add", async () => {
    const faceCard: ClipMoments[] = [
      {
        clip: "cut_02.mp4",
        clipSummary: "",
        moments: [{ inS: 0, outS: 2, shotType: "hand-closeup", memo: "[얼굴노출] face visible", quality: 4 }],
        monotonousRanges: [],
      },
    ];
    vi.mocked(fetchMoments).mockResolvedValue(faceCard);
    render(<MomentPalette {...baseProps()} />);
    await waitFor(() => expect(screen.getByText("Auto-excluded: face exposure")).not.toBeNull());
    expect(screen.getByText("Add")).not.toBeNull();
  });

  it("shows a low-quality banner for a card below the quality threshold", async () => {
    const lowQualityCard: ClipMoments[] = [
      {
        clip: "cut_03.mp4",
        clipSummary: "",
        moments: [{ inS: 0, outS: 2, shotType: "object", memo: "blurry shot", quality: 2 }],
        monotonousRanges: [],
      },
    ];
    vi.mocked(fetchMoments).mockResolvedValue(lowQualityCard);
    render(<MomentPalette {...baseProps()} />);
    await waitFor(() => expect(screen.getByText("Auto-excluded: low quality")).not.toBeNull());
  });
});
