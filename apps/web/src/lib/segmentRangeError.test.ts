import { describe, expect, it } from "vitest";
import type { Segment } from "@cuesheet/schema";
import { segmentRangeError } from "./segmentRangeError.js";

function segment(overrides: Partial<Segment> = {}): Segment {
  return {
    clip: "cut_01.mp4",
    in: 2,
    out: 9,
    speed: 1,
    volume: 1,
    subtitle: "hello",
    ...overrides,
  } as Segment;
}

describe("segmentRangeError", () => {
  it("returns null when in < out (valid)", () => {
    expect(segmentRangeError(segment({ in: 2, out: 9 }))).toBeNull();
  });

  it("returns the schema's in/out message + swap hint when in >= out", () => {
    const message = segmentRangeError(segment({ in: 100, out: 30 }));
    expect(message).toBe("in: in must be less than out (in < out) — swap to in=30, out=100");
  });

  it("returns the message with no hint suffix when in === out (swapping wouldn't fix it)", () => {
    // hints.ts deliberately gives no mechanical-fix hint here (see its own comment) - the message
    // itself is still surfaced, just without the " — swap to..." suffix, matching what Save would show.
    expect(segmentRangeError(segment({ in: 5, out: 5 }))).toBe("in: in must be less than out (in < out)");
  });
});
