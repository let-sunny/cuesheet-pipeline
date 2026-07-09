#!/usr/bin/env node
/**
 * check-language: no Hangul/Hiragana/Katakana/CJK prose text in git-tracked files, outside the
 * documented allowlist. Enforces CLAUDE.md's "everything tracked in git is English" convention.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listTrackedFiles, readTrackedFiles } from "./lib/tracked-files.mjs";
import { findLanguageViolations } from "./lib/language-matcher.mjs";

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");

// Each entry documents *why* the file is allowed to contain non-English prose script - see
// CLAUDE.md's "Language policy" section for the two rules this ratchets from:
// (1) content Claude Code generates as working output (subtitles, scene descriptions, matching
//     against that content) follows the current working language rather than being translated;
// (2) docs/voice-guide.md's Korean example sentences/vocabulary are the corpus data itself.
const LANGUAGE_ALLOWLIST = new Set([
  // Rule (2): defines the target Korean subtitle voice verbatim.
  "docs/voice-guide.md",

  // Rule (1): cuesheet fixture whose subtitle field values are generated working content, not
  // translatable prose.
  "packages/schema/examples/sample.cuesheet.json",

  // Pipeline instruction doc quoting the same Korean tag/vocabulary literals voice-guide.md
  // defines (the face-exposure tag, and several signature sentence-ending/greeting cues) to
  // specify real subtitle-generation behavior - same rationale as voice-guide.md itself.
  ".claude/commands/episode.md",

  // Docs quoting Korean terms/examples as the artifact being discussed, inside otherwise-English
  // prose (a UI-term glossary table, a spelling-convention recap, a literal sample string also
  // hardcoded below, literal user chat quotes, regex keywords matched against commit messages).
  "docs/PRD.md",
  "docs/STATUS.md",
  "docs/USER-GUIDE.md",
  "docs/research/title-render-spike.md",
  "docs/screen-spec.md",
  "docs/token-usage.md",

  // Subtitle-style preview label: previews what a real (Korean) subtitle looks like styled -
  // content, not chrome, so it follows the working language per the UI-language principle.
  "apps/web/src/components/SubtitleStyleSettings/SubtitleStyleSettings.tsx",

  // Face-exposure tag constant + Korean-vocabulary regexes that classify real scene memos/
  // subtitles - functional matching against working content, not translatable prose.
  "apps/web/src/lib/momentCards.ts",
  "apps/web/test/lib/momentCards.test.ts",
  "apps/web/src/components/MomentPalette/MomentPalette.test.tsx",

  // Non-ASCII filename encoding test - needs a real Korean filename literal to exercise the
  // UTF-8 Content-Disposition header it's testing.
  "apps/web/test/server/shared.test.ts",

  // Draft-assembly source: Korean face/body-part keyword list (heuristic matcher) plus the
  // literal Korean timelapse-connector subtitle ("fast forward") it generates - functional/
  // content generation, not prose.
  "packages/draft/src/assemble.ts",
  "packages/draft/test/assemble.test.ts",
  "packages/draft/test/cli.test.ts",
  "packages/draft/test/progress.test.ts",

  // Render-plan tests exercise real Korean subtitle strings end-to-end through drawtext filter
  // generation.
  "packages/render/test/plan.test.ts",
  "packages/render/test/srt.test.ts",

  // Korean regex keywords used to categorize commit-log entries by pipeline stage.
  "scripts/token-usage-report.mjs",

  // This check's own unit test: needs real Hangul/Hiragana/CJK literals as fixture data to
  // exercise the prose-script detector against realistic content (same rationale as the other
  // test fixtures above).
  "scripts/checks/test/language-matcher.test.mjs",
]);

main();

function main() {
  const files = readTrackedFiles(repoRoot, listTrackedFiles(repoRoot));
  const violations = findLanguageViolations(files, LANGUAGE_ALLOWLIST);

  if (violations.length > 0) {
    console.error("check-language: non-English prose script found outside the language allowlist:");
    for (const violation of violations) {
      console.error(`  ${violation}`);
    }
    console.error(
      `\n${violations.length} violation(s). If this is legitimate working content (per CLAUDE.md's language-policy exceptions), add the file to LANGUAGE_ALLOWLIST in scripts/checks/check-language.mjs with a comment explaining why.`,
    );
    process.exit(1);
  }
}
