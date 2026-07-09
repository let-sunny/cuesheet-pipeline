import { describe, expect, it } from "vitest";
import type { Transition } from "@cuesheet/schema";
import { transitionAmountAt, transitionOpacity } from "../../src/lib/transitionOverlay.js";

function fade(durationS = 0.5): Transition {
  return { type: "fade", durationS };
}

function dip(durationS = 0.5, dim = 0.6): Transition {
  return { type: "dip", durationS, dim };
}

describe("transitionAmountAt", () => {
  it("returns 0 when there is no transition", () => {
    expect(transitionAmountAt(undefined, "in", 5, 0)).toBe(0);
    expect(transitionAmountAt(null, "out", 5, 5)).toBe(0);
  });

  it("'in': starts at peak (t<=0) and ramps down to 0 by durationS", () => {
    const t = fade(0.5);
    expect(transitionAmountAt(t, "in", 5, 0)).toBe(1);
    expect(transitionAmountAt(t, "in", 5, 0.25)).toBeCloseTo(0.5, 5);
    expect(transitionAmountAt(t, "in", 5, 0.5)).toBe(0);
    expect(transitionAmountAt(t, "in", 5, 3)).toBe(0);
  });

  it("'out': stays 0 until durationS before the end, then ramps up to peak by the end", () => {
    const t = fade(0.5);
    expect(transitionAmountAt(t, "out", 5, 4)).toBe(0);
    expect(transitionAmountAt(t, "out", 5, 4.5)).toBe(0);
    expect(transitionAmountAt(t, "out", 5, 4.75)).toBeCloseTo(0.5, 5);
    expect(transitionAmountAt(t, "out", 5, 5)).toBe(1);
  });

  it("dip's peak is its own dim (< 1), not fully opaque", () => {
    const t = dip(0.5, 0.6);
    expect(transitionAmountAt(t, "in", 5, 0)).toBe(0.6);
    expect(transitionAmountAt(t, "out", 5, 5)).toBe(0.6);
  });

  it("dip with no explicit dim defaults its peak to 1 (same as fade)", () => {
    const t: Transition = { type: "dip", durationS: 0.5 };
    expect(transitionAmountAt(t, "in", 5, 0)).toBe(1);
  });

  it("clamps durationS to the cut's own duration for a very short cut", () => {
    const t = fade(2); // longer than the 0.4s cut
    expect(transitionAmountAt(t, "in", 0.4, 0)).toBe(1);
    expect(transitionAmountAt(t, "in", 0.4, 0.4)).toBe(0);
    expect(transitionAmountAt(t, "in", 0.4, 0.2)).toBeCloseTo(0.5, 5);
  });

  it("returns 0 for a zero/negative duration cut (guards against division by zero)", () => {
    expect(transitionAmountAt(fade(), "in", 0, 0)).toBe(0);
  });
});

describe("transitionOpacity", () => {
  it("is 1 (fully visible) with no transitions at all", () => {
    expect(transitionOpacity(undefined, undefined, 5, 2)).toBe(1);
  });

  it("is 0 (fully hidden) at the peak of a fade-in", () => {
    expect(transitionOpacity(fade(0.5), undefined, 5, 0)).toBe(0);
  });

  it("only dips partway (never 0) at the peak of a dip with dim < 1", () => {
    expect(transitionOpacity(dip(0.5, 0.6), undefined, 5, 0)).toBeCloseTo(0.4, 5);
  });

  it("takes the max of transitionIn/transitionOut when both could apply (e.g. a very short cut)", () => {
    // durationS 0.6, in/out windows overlap in the middle - both hit their darkest at the
    // midpoint of their own windows; whichever is larger at a given instant wins.
    const opacity = transitionOpacity(fade(0.5), dip(0.5, 0.3), 0.6, 0.3);
    expect(opacity).toBeLessThan(1);
  });

  it("is back to 1 well outside any transition window", () => {
    expect(transitionOpacity(fade(0.5), fade(0.5), 10, 5)).toBe(1);
  });
});
