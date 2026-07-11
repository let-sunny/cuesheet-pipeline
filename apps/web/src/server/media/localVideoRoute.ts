import { stat } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import { extname } from "node:path";
import type { ViteDevServer } from "vite";
import { clipMimeTypes, resolveRepoPath } from "../shared.js";

/**
 * Registers /api/local-video: serves intro/outro clips, which are independent file paths unrelated
 * to clipDir (relative paths are resolved against the repo root). Only read-only GET/HEAD is
 * allowed. HEAD is used by the web app's own supplementary existence check (see
 * lib/videoSourceError.ts) to distinguish a missing file from one that exists but isn't playable
 * video - it must return the same status/headers as GET, just without a body.
 */
export function registerLocalVideoRoute(server: ViteDevServer): void {
  server.middlewares.use("/api/local-video", async (req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Method not allowed");
      return;
    }
    const rawQuery = (req.url ?? "").split("?")[1] ?? "";
    const requestedPath = new URLSearchParams(rawQuery).get("path");
    if (!requestedPath) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("path query parameter is required");
      return;
    }
    const mime = clipMimeTypes[extname(requestedPath).toLowerCase()];
    const targetPath = resolveRepoPath(requestedPath);
    if (!mime || !existsSync(targetPath)) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("File not found");
      return;
    }

    res.setHeader("Content-Type", mime);
    res.setHeader("Accept-Ranges", "bytes");

    const stats = await stat(targetPath);
    const total = stats.size;

    if (req.method === "HEAD") {
      res.statusCode = 200;
      res.setHeader("Content-Length", String(total));
      res.end();
      return;
    }

    const rangeHeader = req.headers.range;
    if (!rangeHeader) {
      res.statusCode = 200;
      res.setHeader("Content-Length", String(total));
      createReadStream(targetPath).pipe(res);
      return;
    }

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
    createReadStream(targetPath, { start, end: safeEnd }).pipe(res);
  });
}
