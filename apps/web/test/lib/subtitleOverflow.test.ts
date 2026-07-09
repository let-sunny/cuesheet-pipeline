import { describe, expect, it } from "vitest";
import {
  estimateTextWidthPx,
  longestUnwrappableToken,
  subtitleOverflowWarning,
} from "../../src/lib/subtitleOverflow.js";

describe("longestUnwrappableToken", () => {
  it("returns the longest run of non-whitespace characters", () => {
    expect(longestUnwrappableToken("short mediumword thisisthelongestone")).toBe(
      "thisisthelongestone",
    );
  });

  it("returns an empty string for empty/whitespace-only text", () => {
    expect(longestUnwrappableToken("")).toBe("");
    expect(longestUnwrappableToken("   \n\t")).toBe("");
  });
});

describe("estimateTextWidthPx", () => {
  it("scales linearly with character count and font size", () => {
    expect(estimateTextWidthPx(10, 48)).toBeCloseTo(10 * 48 * 0.6);
  });
});

describe("subtitleOverflowWarning", () => {
  it("returns null when the longest token fits within the frame width", () => {
    expect(subtitleOverflowWarning("short subtitle line", 48, 1920)).toBeNull();
  });

  it("returns null for empty text", () => {
    expect(subtitleOverflowWarning("", 48, 1920)).toBeNull();
  });

  it("warns when a no-space run is estimated to overflow the frame width", () => {
    const longToken = "a".repeat(100);
    const warning = subtitleOverflowWarning(longToken, 48, 1920);

    expect(warning).not.toBeNull();
    expect(warning).toContain(`${longToken.length}-character run`);
  });
});
