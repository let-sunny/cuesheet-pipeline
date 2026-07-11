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
    // `remotion` + `@remotion/player`: the title preview runs the real TitleCard composition
    // (imported from @cuesheet/render's dist) inside @remotion/player's <Player>. Both sides import
    // `remotion`; if the browser loads two copies, the Player's composition context never reaches
    // TitleCard's useCurrentFrame() and the preview throws/blanks (same dual-instance-context class
    // as the astryx case below). Deduping to one `remotion` connects the Player to the composition.
    dedupe: ["@astryxdesign/core", "@stylexjs/stylex", "react", "react-dom", "remotion", "@remotion/player"],
  },
  // Do NOT pre-bundle the Remotion browser packages. optimizeDeps pre-bundling inlines
  // @remotion/player's own copy of Remotion's Internals (the timeline/frame CONTEXT that drives
  // useCurrentFrame) separately from the standalone `remotion` that the compiled TitleCard
  // (@cuesheet/render/dist) reads - so the Player advanced its frame while TitleCard stayed pinned
  // at frame 0 (confirmed: composition renders but never animates). Leaving them un-pre-bundled +
  // deduped makes every `import "remotion"` resolve to the one node_modules/remotion ESM module, so
  // the Player and the composition share the exact same runtime frame context.
  optimizeDeps: {
    exclude: ["remotion", "@remotion/player", "@cuesheet/render"],
  },
});
