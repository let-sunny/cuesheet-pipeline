import { describe, expect, it } from "vitest";
import { minutesAgoLabel } from "../../src/lib/relativeTime.js";

describe("minutesAgoLabel", () => {
  it("returns 'just now' for under a minute", () => {
    const now = 1_000_000;
    expect(minutesAgoLabel(now - 10_000, now)).toBe("just now");
  });

  it("rounds to the nearest minute", () => {
    const now = 1_000_000;
    expect(minutesAgoLabel(now - 90_000, now)).toBe("2 min ago");
    expect(minutesAgoLabel(now - 3 * 60_000, now)).toBe("3 min ago");
  });

  it("clamps a future savedAt (negative elapsed) to 0 minutes", () => {
    const now = 1_000_000;
    expect(minutesAgoLabel(now + 60_000, now)).toBe("just now");
  });
});
