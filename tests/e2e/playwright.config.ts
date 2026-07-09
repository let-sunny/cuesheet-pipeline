import { defineConfig, devices } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const webDir = resolve(here, "../../packages/web");
const runtimeDir = resolve(here, ".runtime");

const PORT = 5199;

/**
 * Thin Playwright E2E smoke suite - full user journeys against the web app's own dev server,
 * booted on a dedicated port (5199) against a small, checked-in FIXTURE cuesheet (never the real
 * project.cuesheet.json a human might be editing on the normal dev server, port 5173 - that port is
 * untouched by this suite). See CLAUDE.md's testing section and tests/e2e/README.md.
 */
export default defineConfig({
  testDir: "./journeys",
  // Every journey shares one fixture server + one on-disk cuesheet file that journeys mutate
  // (subtitle edits, BGM tracks, render) - concurrent workers would race on that same file.
  // Serial-only keeps this correct; the suite is a handful of short (<30s) journeys so it stays
  // fast without needing worker parallelism (CLAUDE.md "smoke, not exhaustive").
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  // 60s (not the Playwright default 30s) - the very first navigation against a cold Vite dep cache
  // (esbuild optimizing the whole app's dependency graph: React, Astryx core/theme-stone, StyleX,
  // etc.) can take noticeably longer than 30s on a fresh checkout/CI runner, even though the app
  // itself loads in well under a second once that one-time optimization is warm (measured:
  // subsequent navigations in the same run load in ~500-700ms). Only the first test in the run
  // pays this cost, so this doesn't meaningfully change the suite's overall wall-clock budget.
  timeout: 60_000,
  reporter: [["list"]],
  globalSetup: resolve(here, "global-setup.ts"),
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    video: "off",
  },
  webServer: {
    command: `${resolve(webDir, "node_modules/.bin/vite")} --port ${PORT} --strictPort`,
    cwd: webDir,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      CUESHEET_PATH: resolve(runtimeDir, "project.cuesheet.json"),
      MOMENTS_PATH: resolve(runtimeDir, "moments.json"),
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
