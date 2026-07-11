import { readFile } from "node:fs/promises";
import type { ViteDevServer } from "vite";
import { resolveRepoPath } from "./shared.js";
import { registerClipsRoute } from "./media/clipsRoute.js";
import { registerDraftFramesRoute } from "./media/draftFramesRoute.js";
import { registerLocalVideoRoute } from "./media/localVideoRoute.js";
import { registerMomentsRoute } from "./media/momentsRoute.js";
import { generateProxies } from "./media/proxyGeneration.js";
import { registerProxyStatusRoute } from "./media/proxyStatusRoute.js";
import { registerThumbRoute } from "./media/thumbRoute.js";

/**
 * Registers static/proxy/thumbnail/draft-frames serving middleware, and kicks off background
 * proxy generation for the project's clipDir. Each route group lives in its own module under
 * ./media/ - this function is just the composition point plus the one-off background proxy-
 * generation kickoff (registration order across groups doesn't matter, their mount paths are
 * disjoint).
 */
export function registerMediaMiddleware(server: ViteDevServer, filePath: string): void {
  // Run proxy generation in the background so it doesn't block server startup.
  void (async () => {
    let clipDir: string;
    try {
      const raw = await readFile(filePath, "utf8");
      const cuesheet = JSON.parse(raw) as { clipDir?: unknown };
      if (typeof cuesheet.clipDir !== "string" || cuesheet.clipDir.length === 0) {
        return;
      }
      clipDir = resolveRepoPath(cuesheet.clipDir);
    } catch {
      return;
    }
    await generateProxies(clipDir, (msg) => server.config.logger.info(msg));
  })();

  registerClipsRoute(server, filePath);
  registerLocalVideoRoute(server);
  registerProxyStatusRoute(server);
  registerMomentsRoute(server);
  registerDraftFramesRoute(server);
  registerThumbRoute(server);
}
