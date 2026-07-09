import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { astryxStylex } from "@astryxdesign/build/vite";
import { cuesheetPlugin } from "./src/cuesheet-plugin.js";

export default defineConfig({
  plugins: [...astryxStylex(), react(), cuesheetPlugin()],
});
