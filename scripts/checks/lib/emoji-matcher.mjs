/**
 * Finds lines in `files` that contain an emoji character - the machine-enforced form of
 * CLAUDE.md's "no emoji" convention (code, comments, commits, subtitle text examples).
 *
 * Matches codepoints with the Unicode `Emoji_Presentation` property (characters that render as
 * emoji by default), plus VS16 (U+FE0F, explicitly requests emoji rendering for a base character)
 * and regional-indicator letters (flag emoji). Deliberately narrower than "any pictograph-ish
 * codepoint": box-drawing/geometric-shape characters used for ASCII-art diagram arrows or
 * play/pause glyphs default to *text* presentation and must not be flagged.
 *
 * `files` is `{ path, content }[]` (content may be null for binary files, which are skipped).
 */
export function findEmojiViolations(files) {
  const violations = [];
  for (const { path: filePath, content } of files) {
    if (content == null) continue;

    const lines = content.split("\n");
    lines.forEach((line, index) => {
      if (EMOJI_RE.test(line)) {
        violations.push(`${filePath}:${index + 1}: contains an emoji character`);
      }
    });
  }
  return violations;
}

const VARIATION_SELECTOR_16 = String.fromCharCode(0xfe0f);
const EMOJI_RE = new RegExp(`\\p{Emoji_Presentation}|${VARIATION_SELECTOR_16}|\\p{Regional_Indicator}`, "u");
