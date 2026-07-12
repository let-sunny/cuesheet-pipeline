import { describe, expect, it } from "vitest";
import { findUserGuidePresetViolations } from "../lib/user-guide-presets-matcher.mjs";

const VALID = ["fade", "wordStagger", "typing", "highlight"];

describe("findUserGuidePresetViolations", () => {
  it("is clean when the guide names exactly the schema presets", () => {
    const guide = "one of 4 presets (fade/wordStagger/typing/highlight), duration, backdrop";
    expect(findUserGuidePresetViolations(guide, VALID)).toEqual([]);
  });

  it("is order-insensitive", () => {
    const guide = "presets (typing/fade/highlight/wordStagger)";
    expect(findUserGuidePresetViolations(guide, VALID)).toEqual([]);
  });

  it("matches across a wrapped line (newlines normalized)", () => {
    const guide = "one of 4 presets\n    (fade/wordStagger/typing/highlight), duration";
    expect(findUserGuidePresetViolations(guide, VALID)).toEqual([]);
  });

  it("flags stale/pre-rename presets", () => {
    const guide = "one of 4 presets (typing/gooey/melt/particle), duration";
    const violations = findUserGuidePresetViolations(guide, VALID);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/do not match the schema/);
  });

  it("flags a missing preset even when the rest match", () => {
    const guide = "presets (fade/wordStagger/typing)";
    expect(findUserGuidePresetViolations(guide, VALID)).toHaveLength(1);
  });

  it("flags when no preset list is present at all", () => {
    const guide = "the Title turns on a title card with some animation";
    const violations = findUserGuidePresetViolations(guide, VALID);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/no title-preset list found/);
  });

  it("ignores unrelated parenthesized slash-lists (file types, resolutions)", () => {
    const guide =
      "one of 4 presets (fade/wordStagger/typing/highlight). Drop audio files (mp3/m4a/wav) " +
      "into the folder, then export at (720p/1080p/4K).";
    expect(findUserGuidePresetViolations(guide, VALID)).toEqual([]);
  });
});
