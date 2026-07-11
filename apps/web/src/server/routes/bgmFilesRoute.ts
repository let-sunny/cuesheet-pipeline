import { readFile, readdir, stat } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import { extname, relative, resolve, sep } from "node:path";
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
 * Registers /api/bgm-files: list of audio files usable as background music (Edit step BGM
 * gutter's file picker) - repo-root media/ (recursively, a few levels deep - bgm conventionally
 * lives under media/bgm/) plus clipDir itself (non-recursive, in case music was captured
 * alongside the source clips). Same read-disk-every-request pattern as narration/clip-files.
 * Preview streaming shares the same mount path (/api/bgm-files/stream?path=...), same
 * "sub-path selects the behavior" convention as narration-files.
 */
export function registerBgmFilesRoute(server: ViteDevServer, filePath: string, mediaRoot: string): void {
  server.middlewares.use("/api/bgm-files", async (req, res) => {
    if (req.method !== "GET") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Method not allowed");
      return;
    }
    const [rawUrlPath = "", rawQuery = ""] = (req.url ?? "").split("?");
    const rawSub = decodeURIComponent(rawUrlPath.replace(/^\/+/, ""));

    let clipDir: string | null = null;
    try {
      const raw = await readFile(filePath, "utf8");
      const cuesheet = JSON.parse(raw) as { clipDir?: unknown };
      if (typeof cuesheet.clipDir === "string" && cuesheet.clipDir.length > 0) {
        clipDir = resolveRepoPath(cuesheet.clipDir);
      }
    } catch {
      // clipDir not set/unreadable - listing/streaming just falls back to media/ only.
    }

    if (rawSub === "stream") {
      const pathParam = new URLSearchParams(rawQuery).get("path");
      const targetPath = pathParam ? resolveRepoPath(pathParam) : null;
      const mime = targetPath ? narrationAudioMimeTypes[extname(targetPath).toLowerCase()] : undefined;
      const allowed =
        targetPath != null &&
        (isWithin(repoRoot, targetPath) || (clipDir != null && isWithin(clipDir, targetPath)));
      if (!targetPath || !mime || !allowed || !existsSync(targetPath)) {
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

    const found = new Map<string, string>();
    await collectAudioFiles(mediaRoot, 3, found);
    if (clipDir) {
      await collectAudioFiles(clipDir, 0, found);
    }
    const files = await Promise.all(
      Array.from(found.entries()).map(async ([absPath, displayPath]) => ({
        path: displayPath,
        durationS: await probeDurationSeconds(absPath),
      })),
    );
    files.sort((a, b) => a.path.localeCompare(b.path));
    sendJson(res, 200, {
      files,
      note: files.length === 0 ? "No audio files found under media/ or clipDir" : undefined,
    });
  });
}

/**
 * Recursively (up to maxDepth extra levels) collects audio files under dir for the /api/bgm-files
 * listing — keyed by absolute path (dedup, since clipDir and media/ can overlap) to a display path
 * that's repo-root-relative POSIX (e.g. "media/bgm/lofi.mp3", matching the convention bgm.file is
 * already stored as) when the file lives inside the repo, or the absolute path otherwise (e.g.
 * clipDir on an external/iCloud drive) — both forms are valid as-is for ffmpeg -i and for the
 * stream endpoint above.
 */
async function collectAudioFiles(
  dir: string,
  maxDepth: number,
  out: Map<string, string>,
): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const abs = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (maxDepth > 0) {
        await collectAudioFiles(abs, maxDepth - 1, out);
      }
      continue;
    }
    if (narrationAudioMimeTypes[extname(entry.name).toLowerCase()] === undefined || out.has(abs)) {
      continue;
    }
    out.set(abs, isWithin(repoRoot, abs) ? relative(repoRoot, abs).split(sep).join("/") : abs);
  }
}
