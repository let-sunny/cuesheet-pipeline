#!/usr/bin/env node
/**
 * check-component-anatomy: every component folder under apps/web/src/components/ has a
 * co-located test and an index.ts export gate. Enforces CLAUDE.md's "Component layering"
 * convention.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findComponentAnatomyViolations } from "./lib/component-anatomy-matcher.mjs";

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const componentsRoot = path.join(repoRoot, "apps/web/src/components");

// Thin ui/ wrapper components (ToolbarButton/IntroOutroButton/SceneCardButton - see CLAUDE.md's
// "Wrapper naming" section) intentionally hold just Component.tsx + index.ts today. Ratchet this
// list down as they gain tests instead of exempting new folders here.
const TEST_ALLOWLIST = new Set(["ui/IntroOutroButton", "ui/SceneCardButton", "ui/ToolbarButton"]);

main();

function main() {
  const violations = findComponentAnatomyViolations(componentsRoot, { testAllowlist: TEST_ALLOWLIST }).map((violation) =>
    violation.replaceAll(repoRoot + path.sep, ""),
  );

  if (violations.length > 0) {
    console.error("check-component-anatomy: component-anatomy violations:");
    for (const violation of violations) {
      console.error(`  ${violation}`);
    }
    console.error(`\n${violations.length} violation(s).`);
    process.exit(1);
  }
}
