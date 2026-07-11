import { describe, expect, it } from "vitest";
import { clamp } from "../../src/lib/clamp.js";

describe("clamp", () => {
  it("returns the value unchanged when already inside the range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it("clamps to min when below range", () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it("clamps to max when above range", () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it("returns the boundary values themselves unchanged", () => {
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });

  it("handles an inverted (min > max) range by collapsing to min via Math.max/Math.min ordering", () => {
    // Math.min(Math.max(v, min), max) - with min > max, this ends up min-preferring.
    expect(clamp(5, 10, 0)).toBe(0);
  });
});
