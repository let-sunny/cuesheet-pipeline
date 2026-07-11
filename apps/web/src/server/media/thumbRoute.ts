import { mkdir } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import type { ViteDevServer } from "vite";
import { proxyDir, proxyFileName } from "./proxyGeneration.js";
import { getOrGenerateThumb, thumbsDir } from "./thumbnails.js";

/**
 * Registers GET /api/thumb?clip=<original filename>&t=<seconds>&w=<width px, default 160>: seeks
 * to that time in the proxy and returns the extracted frame as a jpg. 404 if there's no proxy (the
 * client draws a placeholder). The cache key rounds t to the nearest 0.5s to reduce cache
 * misses/duplicate generation from slightly different t values during dragging. Width is also part
 * of the cache key (a separate file per w), so the same (clip, time) is regenerated if the
 * requested width differs (used for larger thumbnails like the subtitle style preview).
 */
export function registerThumbRoute(server: ViteDevServer): void {
  server.middlewares.use("/api/thumb", async (req, res) => {
    // Force revalidation for the same reason as /clips — thumbnails are also seek-extracted from
    // the proxy, so if the proxy is regenerated, a stale frame could keep being shown.
    res.setHeader("Cache-Control", "no-cache");
    if (req.method !== "GET") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Method not allowed");
      return;
    }
    const rawQuery = (req.url ?? "").split("?")[1] ?? "";
    const params = new URLSearchParams(rawQuery);
    const clipParam = params.get("clip") ?? "";
    const tParam = params.get("t");
    const t = tParam !== null ? Number(tParam) : NaN;
    const wParam = params.get("w");
    const width = wParam !== null ? Number(wParam) : 160;
    if (
      !clipParam ||
      clipParam !== basename(clipParam) ||
      !Number.isFinite(t) ||
      t < 0 ||
      !Number.isInteger(width) ||
      width < 16 ||
      width > 1920
    ) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Invalid request");
      return;
    }

    const roundedT = Math.round(t * 2) / 2;
    const clipStem = basename(clipParam, extname(clipParam));
    const cacheFileName = `${clipStem}_${roundedT}_${width}.jpg`;
    const cachePath = resolve(thumbsDir, cacheFileName);

    if (existsSync(cachePath)) {
      res.setHeader("Content-Type", "image/jpeg");
      createReadStream(cachePath).pipe(res);
      return;
    }

    const proxyPath = resolve(proxyDir, proxyFileName(clipParam));
    if (!existsSync(proxyPath)) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("No proxy available, can't generate thumbnail");
      return;
    }

    await mkdir(thumbsDir, { recursive: true });
    const ok = await getOrGenerateThumb(cacheFileName, proxyPath, roundedT, width, cachePath);
    if (!ok || !existsSync(cachePath)) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Thumbnail generation failed");
      return;
    }

    res.setHeader("Content-Type", "image/jpeg");
    createReadStream(cachePath).pipe(res);
  });
}
