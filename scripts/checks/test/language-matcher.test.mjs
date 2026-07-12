import { describe, expect, it } from "vitest";
import { findLanguageViolations } from "../lib/language-matcher.mjs";

describe("findLanguageViolations", () => {
  it("flags a Hangul prose line with its file:line", () => {
    const files = [{ path: "docs/example.md", content: "This is English.\n이것은 한국어입니다.\n" }];

    expect(findLanguageViolations(files, new Set())).toEqual([
      "docs/example.md:2: contains non-ASCII prose script text (not in the language allowlist)",
    ]);
  });

  it("is clean for pure-ASCII content", () => {
    const files = [{ path: "docs/example.md", content: "Nothing but English text here.\n" }];

    expect(findLanguageViolations(files, new Set())).toEqual([]);
  });

  it("skips files in the allowlist even when they contain prose script", () => {
    const files = [{ path: "domains/knitting/vision-prompt.md", content: "안녕하세요\n" }];

    expect(findLanguageViolations(files, new Set(["domains/knitting/vision-prompt.md"]))).toEqual([]);
  });

  it("skips binary files (content === null)", () => {
    const files = [{ path: "media/clip.mp4", content: null }];

    expect(findLanguageViolations(files, new Set())).toEqual([]);
  });

  it("also flags Hiragana/Katakana/CJK, not just Hangul", () => {
    const files = [{ path: "docs/example.md", content: "こんにちは\n" }];

    expect(findLanguageViolations(files, new Set())).toHaveLength(1);
  });

  it("does not flag accented Latin or typographic punctuation", () => {
    const files = [{ path: "docs/example.md", content: "café — naïve résumé, ‘quoted’\n" }];

    expect(findLanguageViolations(files, new Set())).toEqual([]);
  });
});
