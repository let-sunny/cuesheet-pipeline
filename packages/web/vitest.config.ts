import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    // Server-side code (routes/media/watch) is the default; component/hook tests opt into jsdom
    // per-file via a `// @vitest-environment jsdom` docblock at the top of the file.
    environment: "node",
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
  },
});
