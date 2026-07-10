import { describe, expect, it } from "vitest";
import {
  extendBgmDrag,
  resolveRowIndexFromBounds,
  startBgmDrag,
} from "../../src/lib/bgmTrackDrag.js";
import type { BgmDragState } from "../../src/lib/bgmTrackDrag.js";

describe("startBgmDrag", () => {
  it("captures the origin range/row/mode into a drag state", () => {
    const drag = startBgmDrag(2, "resize-end", { startCutIdx: 3, endCutIdx: 6 }, 4);
    expect(drag).toEqual({
      bgmIndex: 2,
      mode: "resize-end",
      originStartCutIdx: 3,
      originEndCutIdx: 6,
      originRowIdx: 4,
    });
  });
});

describe("extendBgmDrag", () => {
  const lastIdx = 9; // 10 segments

  describe("move", () => {
    function move(overrides: Partial<BgmDragState> = {}): BgmDragState {
      return {
        bgmIndex: 0,
        mode: "move",
        originStartCutIdx: 3,
        originEndCutIdx: 5,
        originRowIdx: 3,
        ...overrides,
      };
    }

    it("shifts both ends by the same delta, preserving the track's length", () => {
      const drag = move();
      expect(extendBgmDrag(drag, 5, lastIdx)).toEqual({ start: 5, end: 7 });
      expect(extendBgmDrag(drag, 1, lastIdx)).toEqual({ start: 1, end: 3 });
    });

    it("clamps at 0 so the track cannot move past the start of the list", () => {
      const drag = move();
      expect(extendBgmDrag(drag, -10, lastIdx)).toEqual({ start: 0, end: 2 });
    });

    it("clamps so the track cannot move past the end of the list", () => {
      const drag = move();
      expect(extendBgmDrag(drag, 100, lastIdx)).toEqual({ start: 7, end: 9 }); // length 2, lastIdx 9
    });

    it("preserves a zero-length (single-cut) track while moving", () => {
      const drag = move({ originStartCutIdx: 4, originEndCutIdx: 4 });
      expect(extendBgmDrag(drag, 6, lastIdx)).toEqual({ start: 7, end: 7 }); // delta = 6 - originRowIdx(3) = 3
    });
  });

  describe("resize-start", () => {
    function resizeStart(overrides: Partial<BgmDragState> = {}): BgmDragState {
      return {
        bgmIndex: 0,
        mode: "resize-start",
        originStartCutIdx: 3,
        originEndCutIdx: 6,
        originRowIdx: 3,
        ...overrides,
      };
    }

    it("moves just the start edge, leaving the end edge fixed", () => {
      const drag = resizeStart();
      expect(extendBgmDrag(drag, 1, lastIdx)).toEqual({ start: 1, end: 6 });
    });

    it("clamps the start edge at 0", () => {
      const drag = resizeStart();
      expect(extendBgmDrag(drag, -5, lastIdx)).toEqual({ start: 0, end: 6 });
    });

    it("clamps the start edge so it cannot cross the end edge", () => {
      const drag = resizeStart();
      expect(extendBgmDrag(drag, 9, lastIdx)).toEqual({ start: 6, end: 6 });
    });
  });

  describe("resize-end", () => {
    function resizeEnd(overrides: Partial<BgmDragState> = {}): BgmDragState {
      return {
        bgmIndex: 0,
        mode: "resize-end",
        originStartCutIdx: 3,
        originEndCutIdx: 6,
        originRowIdx: 3,
        ...overrides,
      };
    }

    it("moves just the end edge, leaving the start edge fixed", () => {
      const drag = resizeEnd();
      expect(extendBgmDrag(drag, 8, lastIdx)).toEqual({ start: 3, end: 8 });
    });

    it("clamps the end edge at lastIdx", () => {
      const drag = resizeEnd();
      expect(extendBgmDrag(drag, 50, lastIdx)).toEqual({ start: 3, end: lastIdx });
    });

    it("clamps the end edge so it cannot cross the start edge", () => {
      const drag = resizeEnd();
      expect(extendBgmDrag(drag, 0, lastIdx)).toEqual({ start: 3, end: 3 });
    });
  });
});

describe("resolveRowIndexFromBounds", () => {
  it("returns the first row whose bottom edge is at or below clientY", () => {
    const bottoms = [20, 40, 60, 80];
    expect(resolveRowIndexFromBounds(bottoms, 5)).toBe(0);
    expect(resolveRowIndexFromBounds(bottoms, 41)).toBe(2);
    expect(resolveRowIndexFromBounds(bottoms, 60)).toBe(2); // exactly on the boundary counts as this row
  });

  it("clamps to the last row once clientY is past every row's bottom edge", () => {
    const bottoms = [20, 40, 60];
    expect(resolveRowIndexFromBounds(bottoms, 1000)).toBe(2);
  });

  it("skips rows with no mounted element (null bottom) instead of matching them", () => {
    const bottoms = [20, null, 60];
    expect(resolveRowIndexFromBounds(bottoms, 30)).toBe(2); // row 1 has no bounds to match against
  });

  it("returns 0 for an empty row list", () => {
    expect(resolveRowIndexFromBounds([], 30)).toBe(0);
  });
});
