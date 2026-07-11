import { readFile, readdir, stat } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import { basename, extname, isAbsolute, resolve } from "node:path";
import type { ViteDevServer } from "vite";
import {
  isWithin,
  narrationAudioMimeTypes,
  probeDurationSeconds,
  repoRoot,
  resolveRepoPath,
  sendJson,
} from "../shared.js";

/**
 * Registers /api/narration-files: the narration audio file list plus preview streaming at
 * /api/narration-files/<filename> under the same mount path - connect strips the mount prefix, so
 * the two behaviors are distinguished by whether there's a sub-path.
 */
export function registerNarrationFilesRoute(server: ViteDevServer, filePath: string): void {
  server.middlewares.use("/api/narration-files", async (req, res) => {
    if (req.method !== "GET") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Method not allowed");
      return;
    }

    // If a dir query is present, it takes priority — since a folder path currently being edited
    // but not yet saved must still be reflected immediately in the list/preview, this doesn't
    // rely solely on the on-disk cuesheet's narration.dir (which is only updated after a save).
    const [rawUrlPath = "", rawQuery = ""] = (req.url ?? "").split("?");
    const dirParam = new URLSearchParams(rawQuery).get("dir");
    const narrationDir =
      dirParam && dirParam.length > 0 ? resolveRepoPath(dirParam) : await readNarrationDir(filePath);
    const rawSub = decodeURIComponent(rawUrlPath.replace(/^\/+/, ""));

    if (rawSub) {
      // Preview streaming: /api/narration-files/<filename>
      if (!narrationDir || rawSub !== basename(rawSub)) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end("File not found");
        return;
      }
      const mime = narrationAudioMimeTypes[extname(rawSub).toLowerCase()];
      const targetPath = resolve(narrationDir, rawSub);
      if (!mime || !isWithin(narrationDir, targetPath) || !existsSync(targetPath)) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end("File not found");
        return;
      }
      const stats = await stat(targetPath);
      res.setHeader("Content-Type", mime);
      res.setHeader("Content-Length", String(stats.size));
      createReadStream(targetPath).pipe(res);
      return;
    }

    // File listing: /api/narration-files
    if (!narrationDir) {
      sendJson(res, 200, {
        files: [],
        note: "Narration folder is not set (enable narration and specify a folder)",
      });
      return;
    }
    let entries: string[];
    try {
      entries = await readdir(narrationDir);
    } catch {
      sendJson(res, 200, {
        files: [],
        note: `Folder not found: ${narrationDir} (create the folder and add audio files)`,
      });
      return;
    }
    const audioNames = entries.filter(
      (name) => narrationAudioMimeTypes[extname(name).toLowerCase()] !== undefined,
    );
    const files = await Promise.all(
      audioNames.map(async (name) => ({
        name,
        durationS: await probeDurationSeconds(resolve(narrationDir, name)),
      })),
    );
    sendJson(res, 200, { files });
  });
}

/** Reads narration.dir from the cuesheet file and resolves it to an absolute path (relative paths are based on the repo root). */
async function readNarrationDir(cuesheetFilePath: string): Promise<string | null> {
  try {
    const raw = await readFile(cuesheetFilePath, "utf8");
    const cuesheet = JSON.parse(raw) as { narration?: { dir?: unknown } };
    const dir = cuesheet.narration?.dir;
    if (typeof dir !== "string" || dir.length === 0) {
      return null;
    }
    return isAbsolute(dir) ? dir : resolve(repoRoot, dir);
  } catch {
    return null;
  }
}
