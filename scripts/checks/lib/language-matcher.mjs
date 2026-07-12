/**
 * Finds lines in `files` that contain a non-ASCII "prose" script (Hangul, Hiragana, Katakana,
 * CJK ideographs) outside `allowlist` — the machine-enforced form of CLAUDE.md's "everything
 * tracked in git is English" convention.
 *
 * `files` is `{ path, content }[]` (content may be null for binary files, which are skipped).
 * `allowlist` is a Set of exact file paths (relative to the repo root) that are permitted to
 * contain prose-script text — e.g. a domain theme file's Korean matching literals, or a component
 * that legitimately generates/matches real Korean subtitle content rather than writing prose.
 */
export function findLanguageViolations(files, allowlist) {
  const violations = [];
  for (const { path: filePath, content } of files) {
    if (content == null) continue;
    if (allowlist.has(filePath)) continue;

    const lines = content.split("\n");
    lines.forEach((line, index) => {
      if (containsProseScript(line)) {
        violations.push(`${filePath}:${index + 1}: contains non-ASCII prose script text (not in the language allowlist)`);
      }
    });
  }
  return violations;
}

/** Unicode code point ranges for scripts that indicate prose written in a non-English language. */
const PROSE_SCRIPT_RANGES = [
  [0x1100, 0x11ff], // Hangul Jamo
  [0x3130, 0x318f], // Hangul Compatibility Jamo
  [0xac00, 0xd7a3], // Hangul Syllables
  [0x3040, 0x309f], // Hiragana
  [0x30a0, 0x30ff], // Katakana
  [0x4e00, 0x9fff], // CJK Unified Ideographs
];

function containsProseScript(line) {
  for (const char of line) {
    const cp = char.codePointAt(0);
    if (PROSE_SCRIPT_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi)) {
      return true;
    }
  }
  return false;
}
