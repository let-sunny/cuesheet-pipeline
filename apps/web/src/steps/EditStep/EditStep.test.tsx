// @vitest-environment jsdom
import { useRef, useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { CueSheet, Segment } from "@cuesheet/schema";
import { useEditStepActions } from "../../hooks/useEditStepActions.js";
import type { VideoPreviewHandle } from "../../components/VideoPreview/index.js";
import { EditStep } from "./EditStep.js";

// VideoPreview is heavy and unrelated to the BGM gutter/row-rect wiring this file tests (its own
// TrimStrip drag/zoom/ResizeObserver-driven filmstrip is already covered by TrimStrip.test.tsx and
// VideoPreview.test.tsx) - stubbed the same way VideoPreview.test.tsx stubs TrimStrip.
vi.mock("../../components/VideoPreview/index.js", () => ({
  VideoPreview: () => <div data-testid="video-preview-stub" />,
}));

beforeAll(() => {
  // jsdom doesn't implement scrollIntoView (CompactSegmentList's selected-row-scroll effect).
  HTMLElement.prototype.scrollIntoView = () => {};
});

afterEach(cleanup);

function segment(overrides: Partial<Segment> = {}): Segment {
  return {
    clip: "cut_01.mp4",
    in: 0,
    out: 5,
    speed: 1,
    volume: 1,
    subtitle: "",
    ...overrides,
  } as Segment;
}

function baseCue(): CueSheet {
  return {
    project: { name: "p", fps: 30, width: 1920, height: 1080 },
    clipDir: "media/clips",
    intro: null,
    outro: null,
    segments: [
      segment({ clip: "cut_01.mp4", in: 0, out: 5 }),
      segment({ clip: "cut_02.mp4", in: 5, out: 10 }),
      segment({ clip: "cut_03.mp4", in: 10, out: 15 }),
    ],
    bgm: [],
    subtitleStyle: {
      font: "sans-serif",
      size: 40,
      color: "#fff",
      outlineColor: "#000",
      outlineWidth: 2,
      position: "bottom",
      margin: 24,
    },
  };
}

/** Wires the real `useEditStepActions` hook (not a stub) around a stateful `draft`, mirroring how
 * App.tsx actually drives EditStep - the BGM add/collapse/expand regression below needs the real
 * `addBgmTrack` action to append to `draft.bgm` the way it does in production. Every other
 * EditStep prop is a minimal, inert stub (narration/bgm file lists, moments) since this test only
 * exercises the CompactSegmentList/BgmSidePanel cross-component wiring. */
function Harness() {
  const [draft, setDraft] = useState<CueSheet | null>(baseCue());
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedBgmIndex, setSelectedBgmIndex] = useState<number | null>(null);
  const videoPreviewRef = useRef<VideoPreviewHandle | null>(null);
  const actions = useEditStepActions({
    draft,
    setDraft,
    recordDiscreteChange: () => {},
    recordContinuousChange: () => {},
    selectedIndex,
    setSelectedIndex,
    setSelectedBgmIndex,
  });

  if (!draft) {
    return null;
  }

  return (
    <EditStep
      draft={draft}
      selectedIndex={selectedIndex}
      setSelectedIndex={setSelectedIndex}
      selectedBgmIndex={selectedBgmIndex}
      setSelectedBgmIndex={setSelectedBgmIndex}
      moments={[]}
      clipDurations={{}}
      narrationFiles={[]}
      narrationNote={undefined}
      bgmFiles={[]}
      bgmFilesNote={undefined}
      videoPreviewRef={videoPreviewRef}
      actions={actions}
      setIntroOutroFromClip={() => {}}
    />
  );
}

describe("EditStep", () => {
  it(
    "keeps a BGM bar anchored to its cut row across a collapse-then-expand cycle, even when the " +
      "rows' actual on-screen position changed while the panel was collapsed (regression for the " +
      "2026-07-12 Y-misalignment bug: collapsed used to be BgmSidePanel's own local state, so " +
      "toggling it never re-rendered CompactSegmentList, which left rowRects stale relative to " +
      "BgmSidePanel's freshly-remeasured gutterTop - lifting collapsed to EditStep makes every " +
      "toggle re-render CompactSegmentList too, so it re-measures in lockstep)",
    () => {
      // Row/gutter geometry is driven by a mutable `rowTop` closed over here, standing in for "the
      // rows' real on-screen position changed for some reason" (a future layout change, a resize,
      // content reflow - anything that shifts rows without CompactSegmentList's own props
      // changing). The gutter is pinned to 0 throughout (matches this repo's real CSS invariant:
      // both the gutter and row 0 are flush with the shared trimLayout container's top edge).
      let rowTop = 100;
      const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
      HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
        const testId = this.getAttribute("data-testid") ?? "";
        let top = 0;
        if (testId === "bgm-gutter") {
          top = 0;
        } else if (testId.startsWith("cut-row-")) {
          top = rowTop;
        }
        return {
          top,
          bottom: top,
          height: 0,
          left: 0,
          right: 0,
          width: 0,
          x: 0,
          y: top,
          toJSON: () => ({}),
        } as DOMRect;
      };

      try {
        render(<Harness />);

        // Expand the panel and add a track (always anchors at cut 1, see addBgmTrackToSheet).
        fireEvent.click(screen.getByTestId("bgm-panel-toggle"));
        fireEvent.click(screen.getByTestId("bgm-add-track"));

        const barBefore = screen.getByTestId("bgm-bar-0");
        expect(barBefore.style.top).toBe("100px");

        // Simulate the rows having actually moved while the panel was collapsed (the exact class
        // of external change the old design couldn't detect, since CompactSegmentList only
        // re-measured on its OWN render).
        rowTop = 250;

        fireEvent.click(screen.getByTestId("bgm-panel-toggle")); // collapse
        fireEvent.click(screen.getByTestId("bgm-panel-toggle")); // expand again

        // The bar must reflect the CURRENT row position, not the stale 100px snapshot from before
        // the panel was ever touched - this is what would have failed under the old
        // BgmSidePanel-local-state design (rowTop's change would never have propagated).
        const barAfter = screen.getByTestId("bgm-bar-0");
        expect(barAfter.style.top).toBe("250px");
      } finally {
        HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
      }
    },
  );
});
