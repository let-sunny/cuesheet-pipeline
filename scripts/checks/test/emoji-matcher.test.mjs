import { describe, expect, it } from "vitest";
import { findEmojiViolations } from "../lib/emoji-matcher.mjs";

describe("findEmojiViolations", () => {
  it("flags a line containing an emoji", () => {
    // Built at runtime (rather than a literal emoji character in this source file) so this test
    // fixture itself stays clean under check-no-emoji.
    const rocket = String.fromCodePoint(0x1f680);
    const files = [{ path: "README.md", content: `All done!\nShipped it ${rocket}\n` }];

    expect(findEmojiViolations(files)).toEqual(["README.md:2: contains an emoji character"]);
  });

  it("is clean for plain text", () => {
    const files = [{ path: "README.md", content: "All done, no decoration.\n" }];

    expect(findEmojiViolations(files)).toEqual([]);
  });

  it("does not flag box-drawing/geometric-shape characters used for diagrams or play/pause glyphs", () => {
    const files = [{ path: "CLAUDE.md", content: "web ──▶ schema\nplay: ▶ stop: ■\n" }];

    expect(findEmojiViolations(files)).toEqual([]);
  });

  it("flags a base symbol forced to emoji presentation via VS16", () => {
    const files = [{ path: "docs/x.md", content: `heart ❤${String.fromCharCode(0xfe0f)}\n` }];

    expect(findEmojiViolations(files)).toEqual(["docs/x.md:1: contains an emoji character"]);
  });

  it("skips binary files (content === null)", () => {
    const files = [{ path: "media/clip.mp4", content: null }];

    expect(findEmojiViolations(files)).toEqual([]);
  });
});
