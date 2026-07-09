#!/usr/bin/env node
/**
 * check-schema-examples: every *.cuesheet.json under packages/schema/examples/ passes
 * validateCueSheet. Keeps the example fixtures honest as the schema (the contract's single
 * source of truth) evolves.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { findSchemaExampleViolations } from "./lib/schema-examples-matcher.mjs";

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const examplesDir = path.join(repoRoot, "packages/schema/examples");
const schemaDistIndex = path.join(repoRoot, "packages/schema/dist/index.js");

main();

async function main() {
  let validateCueSheet;
  try {
    ({ validateCueSheet } = await import(pathToFileURL(schemaDistIndex).href));
  } catch {
    console.error(
      `check-schema-examples: could not import ${path.relative(repoRoot, schemaDistIndex)} - build @cuesheet/schema first (pnpm --filter @cuesheet/schema build).`,
    );
    process.exit(1);
    return;
  }

  const examples = readdirSync(examplesDir)
    .filter((name) => name.endsWith(".cuesheet.json"))
    .map((name) => ({
      path: path.join("packages/schema/examples", name),
      raw: readFileSync(path.join(examplesDir, name), "utf8"),
    }));

  const violations = findSchemaExampleViolations(examples, validateCueSheet);

  if (violations.length > 0) {
    console.error("check-schema-examples: invalid cuesheet example fixture(s):");
    for (const violation of violations) {
      console.error(`  ${violation}`);
    }
    console.error(`\n${violations.length} violation(s).`);
    process.exit(1);
  }
}
