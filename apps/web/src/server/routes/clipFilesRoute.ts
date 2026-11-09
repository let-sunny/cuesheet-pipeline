import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { ViteDevServer } from "vite";
import { listVideoFilesRecursive, probeDurationSeconds, resolveRepoPath, sendJson } from "../shared.js";

/**
 * Registers /api/clip-files: the list of video files inside clipDir (+ffprobe duration), for
 * picking an intro/outro. Reads disk on every request for an always-fresh listing.
 */
export function registerClipFilesRoute(server: ViteDevServer, filePath: string): void {
  server.middlewares.use("/api/clip-files", async (req, res) => {
    if (req.method !== "GET") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Method not allowed");
      return;
    }
    let clipDir: string;
    try {
      const raw = await readFile(filePath, "utf8");
      const cuesheet = JSON.parse(raw) as { clipDir?: unknown };
      if (typeof cuesheet.clipDir !== "string" || cuesheet.clipDir.length === 0) {
        throw new Error("clipDir missing");
      }
      clipDir = resolveRepoPath(cuesheet.clipDir);
    } catch {
      sendJson(res, 200, { files: [], note: "clipDir is not set" });
      return;
    }
    let videoNames: string[];
    try {
      videoNames = (await listVideoFilesRecursive(clipDir)).sort((a, b) => a.localeCompare(b));
    } catch {
      sendJson(res, 200, {
        files: [],
        note: `Folder not found: ${clipDir} (the path may be broken due to an iCloud folder rename/move, etc.)`,
      });
      return;
    }
    const files = await Promise.all(
      videoNames.map(async (name) => {
        const p = resolve(clipDir, name);
        let s;
        try {
          s = await stat(p);
        } catch {
          return { name, durationS: null };
        }
        if (s.blocks === 0) {
          // Skip cloud-only placeholders (e.g. iCloud) since running ffprobe on them hangs indefinitely.
          return { name, durationS: null };
        }
        return { name, durationS: await probeDurationSeconds(p) };
      }),
    );
    sendJson(res, 200, { files });
  });
}
