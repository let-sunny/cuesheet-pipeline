import { defineConfig } from "vitest/config";

// Root-level config: unit-tests the scripts/checks/ matchers only. Every workspace package
// (apps/*, packages/*) has its own vitest.config.ts run via `pnpm -r test` - this one is
// deliberately separate since scripts/ is not a workspace package.
export default defineConfig({
  test: {
    include: ["scripts/checks/test/**/*.test.mjs"],
  },
});
