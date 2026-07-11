import { resolve } from "node:path";
import type { ViteDevServer } from "vite";
import { repoRoot } from "./shared.js";
import type { CuesheetWatcher } from "./watch.js";
import { registerBgmFilesRoute } from "./routes/bgmFilesRoute.js";
import { registerClipFilesRoute } from "./routes/clipFilesRoute.js";
import { registerCuesheetRoute } from "./routes/cuesheetRoute.js";
import { registerFrameCaptureRoute } from "./routes/frameCaptureRoute.js";
import { registerNarrationFilesRoute } from "./routes/narrationFilesRoute.js";
import { registerRenderRoutes } from "./routes/renderRoute.js";
import { registerSubtitlesRoute } from "./routes/subtitlesRoute.js";
import { DEFAULT_UPLOAD_CLIP_MAX_BYTES, registerUploadClipRoute } from "./routes/uploadClipRoute.js";

export interface RegisterRoutesOptions {
  uploadClipMaxBytes?: number;
  /** Root directory /api/bgm-files scans recursively (default: repo-root media/). Overridable for tests. */
  mediaRoot?: string;
}

/**
 * Registers the cuesheet API route handlers: cuesheet GET/POST, render + render-status,
 * subtitles.srt, upload-clip, clip-files, bgm-files, narration-files, and the render output
 * download route. Each route group lives in its own module under ./routes/ - this function is
 * just the composition point (registration order across groups doesn't matter since their mount
 * paths are disjoint prefixes; only render/status-before-render, preserved inside
 * registerRenderRoutes, actually matters).
 */
export function registerRoutes(
  server: ViteDevServer,
  filePath: string,
  watcher: CuesheetWatcher,
  options: RegisterRoutesOptions = {},
): void {
  const uploadClipMaxBytes = options.uploadClipMaxBytes ?? DEFAULT_UPLOAD_CLIP_MAX_BYTES;
  const mediaRoot = options.mediaRoot ?? resolve(repoRoot, "media");

  registerCuesheetRoute(server, filePath, watcher);
  registerNarrationFilesRoute(server, filePath);
  registerClipFilesRoute(server, filePath);
  registerBgmFilesRoute(server, filePath, mediaRoot);
  registerUploadClipRoute(server, filePath, uploadClipMaxBytes);
  registerFrameCaptureRoute(server, filePath);
  registerSubtitlesRoute(server, filePath);
  registerRenderRoutes(server, filePath);
}
