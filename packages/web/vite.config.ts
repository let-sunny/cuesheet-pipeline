import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cuesheetPlugin } from "./src/cuesheet-plugin.js";

export default defineConfig({
  plugins: [react(), cuesheetPlugin()],
});
