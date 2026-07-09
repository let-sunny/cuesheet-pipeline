import { mkdirSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const runtimeDir = resolve(here, ".runtime");
const clipsDir = resolve(runtimeDir, "clips");

/**
 * Runs once before the whole E2E run (before the fixture webServer starts - see
 * playwright.config.ts's globalSetup). Makes every run idempotent regardless of what a previous
 * run's save/render journeys left on disk:
 *  - generates the tiny fixture clips (skipped if already present, so repeat local runs stay fast)
 *  - writes a FRESH runtime cuesheet copy from the checked-in template (fixtures/*.template.json),
 *    with clipDir resolved to this run's actual absolute fixture-clips path (the template itself
 *    can't hardcode an absolute path - it isn't portable across machines/checkouts)
 * The fixture server points at these two runtime files via CUESHEET_PATH/MOMENTS_PATH
 * (playwright.config.ts's webServer.env) - never at the real project.cuesheet.json a human is
 * editing on the normal dev server (port 5173).
 */
export default function globalSetup(): void {
  mkdirSync(runtimeDir, { recursive: true });
  mkdirSync(clipsDir, { recursive: true });

  execFileSync("bash", [resolve(here, "fixtures/generate-fixture-media.sh"), clipsDir], {
    stdio: "inherit",
  });

  const template = JSON.parse(
    readFileSync(resolve(here, "fixtures/project.cuesheet.template.json"), "utf8"),
  ) as Record<string, unknown>;
  template.clipDir = clipsDir;
  writeFileSync(
    resolve(runtimeDir, "project.cuesheet.json"),
    `${JSON.stringify(template, null, 2)}\n`,
    "utf8",
  );

  copyFileSync(resolve(here, "fixtures/moments.json"), resolve(runtimeDir, "moments.json"));
}
