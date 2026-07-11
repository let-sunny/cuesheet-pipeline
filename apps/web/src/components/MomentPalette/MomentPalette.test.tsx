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
    onAddSegment: vi.fn(),
    onRemoveSegment: vi.fn(),
    ...overrides,
  };
}

describe("MomentPalette card action toggle", () => {
  it("shows a single 'Add' button (not a pair) when the card isn't in use", async () => {
    vi.mocked(fetchMoments).mockResolvedValue(oneCard);
    render(<MomentPalette {...baseProps()} />);
    await waitFor(() => expect(screen.getByTestId(/palette-card-toggle-/)).not.toBeNull());
    // Icon-only button (2026-07-11) - `label` becomes the accessible name (aria-label), so it's
    // selected by role/name rather than visible text (CLAUDE.md: select by testid/role, not class
    // or text that's no longer rendered on screen).
    expect(screen.getByRole("button", { name: "Add" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
  });

  it("calls onAddSegment when Add is clicked", async () => {
    vi.mocked(fetchMoments).mockResolvedValue(oneCard);
    const onAddSegment = vi.fn();
    render(<MomentPalette {...baseProps({ onAddSegment })} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Add" })).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(onAddSegment).toHaveBeenCalledOnce();
  });

  it("flips to a single 'Remove' button once the card's range is already added", async () => {
    vi.mocked(fetchMoments).mockResolvedValue(oneCard);
    const segments: Segment[] = [{ clip: "cut_01.mp4", in: 1, out: 3, speed: 1, volume: 1, subtitle: "" }];
    render(<MomentPalette {...baseProps({ segments })} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Remove" })).not.toBeNull());
    expect(screen.queryByRole("button", { name: "Add" })).toBeNull();

    const onRemoveSegment = vi.fn();
    cleanup();
    render(<MomentPalette {...baseProps({ segments, onRemoveSegment })} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Remove" })).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(onRemoveSegment).toHaveBeenCalledWith("cut_01.mp4", 1, 3);
  });

  it("does not render Set intro/Set outro on scene cards (2026-07-11 - moved to Edit step's cut settings only)", async () => {
    vi.mocked(fetchMoments).mockResolvedValue(oneCard);
    render(<MomentPalette {...baseProps()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Add" })).not.toBeNull());
    expect(screen.queryByRole("button", { name: "Set intro" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Set outro" })).toBeNull();
  });
});

describe("MomentPalette category filter", () => {
  const twoCategories: ClipMoments[] = [
    {
      clip: "cut_10.mp4",
      clipSummary: "",
      moments: [{ inS: 1, outS: 3, shotType: "hand-closeup", memo: "knitting a sock cuff", quality: 4 }],
      monotonousRanges: [],
    },
    {
      clip: "cut_11.mp4",
      clipSummary: "",
      moments: [{ inS: 0, outS: 2, shotType: "cat", memo: "the cat walks in", quality: 4 }],
      monotonousRanges: [],
    },
  ];

  it("filters the card grid to the picked category when its chip is clicked", async () => {
    vi.mocked(fetchMoments).mockResolvedValue(twoCategories);
    render(<MomentPalette {...baseProps()} />);
    await waitFor(() => expect(screen.getByText("knitting a sock cuff")).not.toBeNull());
    // Both cards visible under the default "all" filter.
    expect(screen.getByText("the cat walks in")).not.toBeNull();

    // Clicking the "Cat (1)" category chip should drop the knitting card.
    fireEvent.click(screen.getByRole("button", { name: "Cat (1)" }));
    await waitFor(() => expect(screen.queryByText("knitting a sock cuff")).toBeNull());
    expect(screen.getByText("the cat walks in")).not.toBeNull();
  });

  it("reflects the active filter in the header count instead of a static total (2026-07-11)", async () => {
    vi.mocked(fetchMoments).mockResolvedValue(twoCategories);
    render(<MomentPalette {...baseProps()} />);
    await waitFor(() => expect(screen.getByText("knitting a sock cuff")).not.toBeNull());
    // No filter active: plain total.
    expect(screen.getByText("Scene candidates (2)")).not.toBeNull();

    // Filtering to "Cat (1)" narrows the grid to 1 of the 2 total cards.
    fireEvent.click(screen.getByRole("button", { name: "Cat (1)" }));
    await waitFor(() => expect(screen.getByText("Scene candidates (1 of 2)")).not.toBeNull());

    // Clicking the already-active chip again clears the filter back to the plain total.
    fireEvent.click(screen.getByRole("button", { name: "Cat (1)" }));
    await waitFor(() => expect(screen.getByText("Scene candidates (2)")).not.toBeNull());
  });
});

describe("MomentPalette status filter (SegmentedControl)", () => {
  const oneInUseOneNot: ClipMoments[] = [
    {
      clip: "cut_10.mp4",
      clipSummary: "",
      moments: [{ inS: 1, outS: 3, shotType: "hand-closeup", memo: "knitting a sock cuff", quality: 4 }],
      monotonousRanges: [],
    },
    {
      clip: "cut_11.mp4",
      clipSummary: "",
      moments: [{ inS: 0, outS: 2, shotType: "cat", memo: "the cat walks in", quality: 4 }],
      monotonousRanges: [],
    },
  ];
  // Only the knitting card (cut_10.mp4, 1-3) overlaps an added segment - it's "in use"; the cat
  // card is not.
  const inUseSegments: Segment[] = [{ clip: "cut_10.mp4", in: 1, out: 3, speed: 1, volume: 1, subtitle: "" }];

  it("renders status as a radiogroup with All/In use/Excluded radios (2026-07-11 restructure)", async () => {
    vi.mocked(fetchMoments).mockResolvedValue(oneInUseOneNot);
    render(<MomentPalette {...baseProps({ segments: inUseSegments })} />);
    await waitFor(() => expect(screen.getByText("knitting a sock cuff")).not.toBeNull());

    expect(screen.getByRole("radiogroup", { name: "Filter by status" })).not.toBeNull();
    expect(screen.getByRole("radio", { name: "All" })).not.toBeNull();
    expect(screen.getByRole("radio", { name: "In use" })).not.toBeNull();
    expect(screen.getByRole("radio", { name: "Excluded" })).not.toBeNull();
  });

  it("narrows the grid to in-use cards when the 'In use' radio is selected", async () => {
    vi.mocked(fetchMoments).mockResolvedValue(oneInUseOneNot);
    render(<MomentPalette {...baseProps({ segments: inUseSegments })} />);
    await waitFor(() => expect(screen.getByText("knitting a sock cuff")).not.toBeNull());
    expect(screen.getByText("the cat walks in")).not.toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: "In use" }));
    await waitFor(() => expect(screen.queryByText("the cat walks in")).toBeNull());
    expect(screen.getByText("knitting a sock cuff")).not.toBeNull();
  });

  it("ghosts (dims + disables) a category pill whose faceted count drops to 0 under the active status filter", async () => {
    vi.mocked(fetchMoments).mockResolvedValue(oneInUseOneNot);
    render(<MomentPalette {...baseProps({ segments: inUseSegments })} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Cat (1)" })).not.toBeNull());
    // Neither pill is disabled under "All" - both categories have cards.
    expect((screen.getByRole("button", { name: "Cat (1)" }) as HTMLButtonElement).disabled).toBe(false);

    // Under "In use", only the knitting card qualifies - Cat's faceted count drops to 0, but the
    // pill stays visible (Knitting/Cat both remain "cards that exist at all") and its count
    // updates in place rather than the pill vanishing.
    fireEvent.click(screen.getByRole("radio", { name: "In use" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Cat (0)" })).not.toBeNull());
    const catPill = screen.getByRole("button", { name: "Cat (0)" }) as HTMLButtonElement;
    expect(catPill.getAttribute("aria-disabled") ?? catPill.disabled).toBeTruthy();
    // The Knitting pill (still faceted-count 1) stays enabled.
    const knittingPill = screen.getByRole("button", { name: "Knitting (1)" }) as HTMLButtonElement;
    expect(knittingPill.getAttribute("aria-disabled") ?? knittingPill.disabled).toBeFalsy();
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
    await waitFor(() => expect(screen.getByRole("button", { name: "Add" })).not.toBeNull());

    fireEvent.click(screen.getByText("Collapse"));
    expect(screen.queryByRole("button", { name: "Add" })).toBeNull();
    expect(screen.getByText("Expand")).not.toBeNull();

    fireEvent.click(screen.getByText("Expand"));
    expect(screen.getByRole("button", { name: "Add" })).not.toBeNull();
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
    expect(screen.getByRole("button", { name: "Add" })).not.toBeNull();
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
