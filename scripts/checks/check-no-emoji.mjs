#!/usr/bin/env node
/**
 * check-no-emoji: no emoji codepoints in git-tracked files. Enforces CLAUDE.md's blanket
 * "no emoji" convention (code, comments, commits, subtitle text examples - anywhere).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listTrackedFiles, readTrackedFiles } from "./lib/tracked-files.mjs";
import { findEmojiViolations } from "./lib/emoji-matcher.mjs";

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");

main();

function main() {
  const files = readTrackedFiles(repoRoot, listTrackedFiles(repoRoot));
  const violations = findEmojiViolations(files);

  if (violations.length > 0) {
    console.error("check-no-emoji: emoji found in tracked files:");
    for (const violation of violations) {
      console.error(`  ${violation}`);
    }
    console.error(`\n${violations.length} violation(s). Remove the emoji - CLAUDE.md's "no emoji" rule has no exceptions.`);
    process.exit(1);
  }
}
