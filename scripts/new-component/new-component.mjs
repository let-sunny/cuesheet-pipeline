#!/usr/bin/env node
/**
 * new-component: scaffolds a new component folder under apps/web/src/components/ (or --dir) with
 * the repo's enforced component anatomy (<Name>.tsx + <Name>.styles.ts + <Name>.test.tsx +
 * index.ts) - see scripts/checks/check-component-anatomy.mjs for what generated output must
 * satisfy, and CLAUDE.md's "Component layering" section for the convention this makes
 * machine-executable. Templates live as committed files under templates/component/ (astryx
 * pattern) rather than string literals here, so editing the convention means editing a template.
 *
 * Usage: pnpm new:component <Name> [--dir apps/web/src/components]
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateComponent } from "./lib/component-template.mjs";

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const templatesDir = path.join(repoRoot, "scripts/new-component/templates/component");

main();

function main() {
  const args = process.argv.slice(2);
  const name = args.find((arg) => !arg.startsWith("--"));
  const dirFlagIndex = args.indexOf("--dir");
  const dirArg = dirFlagIndex >= 0 ? args[dirFlagIndex + 1] : "apps/web/src/components";

  if (!name || !dirArg) {
    console.error("usage: pnpm new:component <Name> [--dir apps/web/src/components]");
    process.exit(1);
  }

  const componentsRoot = path.join(repoRoot, dirArg);

  try {
    const written = generateComponent({ name, componentsRoot, templatesDir });
    console.log(`new-component: created ${path.join(dirArg, name)}/`);
    for (const file of written) {
      console.log(`  ${path.relative(repoRoot, file)}`);
    }
  } catch (err) {
    console.error(`new-component: ${err.message}`);
    process.exit(1);
  }
}
