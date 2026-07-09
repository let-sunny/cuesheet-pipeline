import { defineConfig } from "vitest/config";
import { astryxStylex } from "@astryxdesign/build/vite";

/**
 * Vitest Browser Mode project — runs `*.browser.test.tsx` files in a real Chromium instance
 * (via the Playwright provider) instead of jsdom. Kept as a SEPARATE config/command
 * (`pnpm test:browser`) rather than folded into vitest.config.ts's default `vitest run` — that
 * keeps `pnpm test`/`pnpm -r test` fast and dependency-light (no Chromium download/launch
 * required) for the common case, while opting individual risky visual/interaction cases into a
 * real browser deliberately, file by file (see CLAUDE.md's testing section).
 *
 * Reach for this only when jsdom genuinely can't exercise the behavior (real layout/animation
 * timing, real `<input>` focus/selection/typing) — everything else stays a fast jsdom unit test.
 */
export default defineConfig({
  plugins: [...astryxStylex()],
  esbuild: { jsx: "automatic" },
  // Pre-declared so Vite doesn't discover+optimize these mid-run on a cold cache (a first run
  // otherwise reloads the browser page partway through, which can fail/duplicate a test - Vitest
  // itself warns about this: "Vite unexpectedly reloaded a test").
  optimizeDeps: { include: ["react/jsx-dev-runtime", "react-dom/client", "@testing-library/react"] },
  test: {
    include: ["src/**/*.browser.test.tsx"],
    browser: {
      enabled: true,
      provider: "playwright",
      name: "chromium",
      headless: true,
      screenshotFailures: false,
    },
  },
});
