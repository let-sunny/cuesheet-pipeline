import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { astryxStylex } from "@astryxdesign/build/vite";
import { cuesheetPlugin } from "./src/cuesheet-plugin.js";

export default defineConfig({
  plugins: [...astryxStylex(), react(), cuesheetPlugin()],
  // Force a SINGLE instance of @astryxdesign/core (and its stylex runtime) in the browser.
  // The dependency graph pulls @astryxdesign/core@0.1.3 in twice - once against @stylexjs/stylex
  // 0.18.3 (the app/theme runtime path) and once against 0.19.0 (the @astryxdesign/build + cli dev
  // tooling) - so pnpm materializes two physical copies. Without deduping, Vite loads both, which
  // creates two distinct React contexts: a component that reads a group/provider context (e.g.
  // ToggleButton reading ToggleButtonGroup, so the Scenes category/status filters) gets `null`
  // because the provider it renders under lives in the other copy, and every such interaction
  // becomes a silent no-op. Deduping collapses them to the app's single copy so context connects.
  resolve: {
    // `remotion`: TitlePreview (apps/web's own plain-React, requestAnimationFrame-driven
    // component - @remotion/player was dropped, see docs/goals, after repeatedly failing to
    // reliably animate in this environment) renders TitleCardView (from @cuesheet/render/remotion,
    // imported from its dist build), which calls `spring`/`interpolate` from `remotion` - pure
    // math, so a single deduped copy is only a hygiene measure here, not load-bearing the way it
    // was for the old Player/composition context pairing.
    dedupe: ["@astryxdesign/core", "@stylexjs/stylex", "react", "react-dom", "remotion"],
  },
});
