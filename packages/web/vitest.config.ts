import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    // Server-side code (routes/media/watch) is the default; component/hook tests opt into jsdom
    // per-file via a `// @vitest-environment jsdom` docblock at the top of the file.
    environment: "node",
    // test/**: server-side + lib/hook tests (existing convention, mirrors src/ structure).
    // src/**: co-located Component.test.tsx next to the component it tests (anatomy convention,
    // CLAUDE.md "Component layering").
    include: ["test/**/*.test.ts", "test/**/*.test.tsx", "src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
