import { readFile, stat } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import type { ViteDevServer } from "vite";
import { clipMimeTypes, resolveRepoPath } from "../shared.js";
import { proxyDir, proxyFileName } from "./proxyGeneration.js";

/**
 * Registers /clips: serves a clip by file name, preferring its 720p proxy when one exists (falls
 * back to the original, or ?original=1 to force the original even when a proxy exists - an escape
 * hatch for render verification). Supports HTTP range requests for video seeking.
 */
export function registerClipsRoute(server: ViteDevServer, filePath: string): void {
  server.middlewares.use("/clips", async (req, res) => {
    // A proxy can go from corrupted -> regenerated overnight, so force revalidation on every
    // request (across 200/206/error responses) so the browser doesn't keep using a cached
    // corrupted video.
    res.setHeader("Cache-Control", "no-cache");
    const [rawPath = "", rawQuery = ""] = (req.url ?? "").split("?");
    const decoded = decodeURIComponent(rawPath.replace(/^\/+/, ""));
    if (!decoded || decoded !== basename(decoded)) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Invalid filename");
      return;
    }
    // ?original=1 always serves the original even if a proxy exists (an escape hatch for render verification).
    const forceOriginal = new URLSearchParams(rawQuery).get("original") === "1";

    let clipDir: string;
    try {
      const raw = await readFile(filePath, "utf8");
      const cuesheet = JSON.parse(raw) as { clipDir?: unknown };
      if (typeof cuesheet.clipDir !== "string" || cuesheet.clipDir.length === 0) {
        throw new Error("clipDir missing");
      }
      clipDir = resolveRepoPath(cuesheet.clipDir);
    } catch {
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Clip not found");
      return;
    }

    const originalPath = resolve(clipDir, decoded);
    const proxyPath = resolve(proxyDir, proxyFileName(decoded));

    let clipPath: string;
    if (!forceOriginal && existsSync(proxyPath)) {
      clipPath = proxyPath;
    } else if (existsSync(originalPath)) {
      clipPath = originalPath;
    } else {
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Clip not found");
      return;
    }

    const mime = clipMimeTypes[extname(clipPath).toLowerCase()] ?? "application/octet-stream";
    res.setHeader("Content-Type", mime);
    res.setHeader("Accept-Ranges", "bytes");

    const stats = await stat(clipPath);
    const total = stats.size;

    const rangeHeader = req.headers.range;
    if (!rangeHeader) {
      res.statusCode = 200;
      res.setHeader("Content-Length", String(total));
      createReadStream(clipPath).pipe(res);
      return;
    }

    // Multi-range is not supported, only the first range is handled.
    const firstRange = rangeHeader.replace(/^bytes=/, "").split(",")[0] ?? "";
    const [startStr, endStr] = firstRange.split("-");
    const start = startStr ? parseInt(startStr, 10) : 0;
    const end = endStr ? parseInt(endStr, 10) : total - 1;

    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= total) {
      res.statusCode = 416;
      res.setHeader("Content-Range", `bytes */${total}`);
      res.end();
      return;
    }

    const safeEnd = Math.min(end, total - 1);
    res.statusCode = 206;
    res.setHeader("Content-Range", `bytes ${start}-${safeEnd}/${total}`);
    res.setHeader("Content-Length", String(safeEnd - start + 1));
    createReadStream(clipPath, { start, end: safeEnd }).pipe(res);
  });
}
