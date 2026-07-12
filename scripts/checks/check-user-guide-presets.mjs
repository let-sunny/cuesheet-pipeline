#!/usr/bin/env node
/**
 * check-user-guide-presets: the title presets named in docs/USER-GUIDE.md match the schema's
 * titlePresetSchema (the contract's single source of truth). A narrow drift pin, added after the
 * guide was found still naming pre-rename presets. Imports the built schema, so run after
 * `pnpm --filter @cuesheet/schema build`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { findUserGuidePresetViolations } from "./lib/user-guide-presets-matcher.mjs";

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const guidePath = path.join(repoRoot, "docs/USER-GUIDE.md");
const schemaDistIndex = path.join(repoRoot, "packages/schema/dist/index.js");

main();

async function main() {
  let titlePresetSchema;
  try {
    ({ titlePresetSchema } = await import(pathToFileURL(schemaDistIndex).href));
  } catch {
    console.error(
      `check-user-guide-presets: could not import ${path.relative(repoRoot, schemaDistIndex)} - build @cuesheet/schema first (pnpm --filter @cuesheet/schema build).`,
    );
    process.exit(1);
    return;
  }

  const validPresets = titlePresetSchema.options ?? Object.values(titlePresetSchema.enum ?? {});
  const guideText = readFileSync(guidePath, "utf8");
  const violations = findUserGuidePresetViolations(guideText, validPresets);

  if (violations.length > 0) {
    console.error("check-user-guide-presets: USER-GUIDE title presets are out of sync with the schema:");
    for (const violation of violations) {
      console.error(`  ${violation}`);
    }
    console.error(`\n${violations.length} violation(s).`);
    process.exit(1);
  }
}
