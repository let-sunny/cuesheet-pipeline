#!/usr/bin/env node
/**
 * check-doc-facts: the generalized "guarded-mechanical" doc pin (docs/doc-surfaces.md). Every
 * `pnpm <script>` a human-facing doc names must be a real root package.json script (or a pnpm
 * builtin). Add a surface by listing its file in DOC_FILES below.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findDocScriptViolations } from "./lib/doc-facts-matcher.mjs";

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const DOC_FILES = ["README.md", "docs/USER-GUIDE.md", "docs/FIRST-EPISODE.md"];

main();

function main() {
  const rootPkg = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  const rootScripts = Object.keys(rootPkg.scripts ?? {});
  const docs = DOC_FILES.map((rel) => ({ path: rel, text: readFileSync(path.join(repoRoot, rel), "utf8") }));

  const violations = findDocScriptViolations(docs, rootScripts);
  if (violations.length > 0) {
    console.error("check-doc-facts: docs name pnpm scripts that don't exist:");
    for (const violation of violations) {
      console.error(`  ${violation}`);
    }
    console.error(`\n${violations.length} violation(s).`);
    process.exit(1);
  }
}
