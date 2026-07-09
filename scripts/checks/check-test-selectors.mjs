#!/usr/bin/env node
/**
 * check-test-selectors: no class-name DOM selection inside test files. Enforces CLAUDE.md's
 * "tests always select by data-testid (or ARIA role) - never by class name" rule.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listTrackedFiles, readTrackedFiles } from "./lib/tracked-files.mjs";
import { findTestSelectorViolations } from "./lib/test-selector-matcher.mjs";

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const TEST_FILE_RE = /\.test\.tsx?$/;

main();

function main() {
  const testFilePaths = listTrackedFiles(repoRoot).filter((relPath) => TEST_FILE_RE.test(relPath));
  const files = readTrackedFiles(repoRoot, testFilePaths);
  const violations = findTestSelectorViolations(files);

  if (violations.length > 0) {
    console.error("check-test-selectors: class-name selection found in test files:");
    for (const violation of violations) {
      console.error(`  ${violation}`);
    }
    console.error(`\n${violations.length} violation(s).`);
    process.exit(1);
  }
}
