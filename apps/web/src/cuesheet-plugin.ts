import type { Plugin } from "vite";
import { cuesheetPath } from "./server/shared.js";
import { registerMediaMiddleware } from "./server/media.js";
import { registerRoutes } from "./server/routes.js";
import { createCuesheetWatcher } from "./server/watch.js";

/**
 * Attaches to the dev server: middleware that serves/saves the cuesheet file, middleware that
 * statically serves clips, and an HMR custom event that detects file changes and notifies the client.
 */
export function cuesheetPlugin(): Plugin {
  return {
    name: "cuesheet-plugin",
    configureServer(server) {
      const filePath = cuesheetPath();
      const watcher = createCuesheetWatcher();

      registerMediaMiddleware(server, filePath);
      registerRoutes(server, filePath, watcher);
      watcher.attach(server, filePath);
    },
  };
}
