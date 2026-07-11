import { readdir } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import { extname, resolve } from "node:path";
import type { ViteDevServer } from "vite";
import { isWithin, sendJson } from "../shared.js";
import { framesRoot } from "./momentsPaths.js";

/**
 * Registers /draft-frames and /api/draft-frames: statically serves per-clip thumbnail frames
 * (/draft-frames/<clip-folder>/<filename>.jpg) and lists frame files inside a clip folder so the
 * client can pick the frame closest to a segment's inS.
 */
export function registerDraftFramesRoute(server: ViteDevServer): void {
  // Statically serves per-clip thumbnail frames. /draft-frames/<clip-folder>/<filename>.jpg
  server.middlewares.use("/draft-frames", async (req, res) => {
    if (req.method !== "GET") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Method not allowed");
      return;
    }
    const rawPath = decodeURIComponent(
      (req.url ?? "").split("?")[0]?.replace(/^\/+/, "") ?? "",
    );
    const root = framesRoot();
    const target = resolve(root, rawPath);
    if (!rawPath || !isWithin(root, target) || extname(target).toLowerCase() !== ".jpg") {
      res.statusCode = 400;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Invalid path");
      return;
    }
    if (!existsSync(target)) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Frame not found");
      return;
    }
    res.setHeader("Content-Type", "image/jpeg");
    createReadStream(target).pipe(res);
  });

  // List of frame files inside a clip folder — lets the client pick the frame closest to inS.
  server.middlewares.use("/api/draft-frames", async (req, res) => {
    if (req.method !== "GET") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Method not allowed");
      return;
    }
    const folder = decodeURIComponent(
      (req.url ?? "").split("?")[0]?.replace(/^\/+/, "") ?? "",
    );
    const root = framesRoot();
    const target = resolve(root, folder);
    if (!folder || folder.includes("/") || !isWithin(root, target)) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Invalid clip folder");
      return;
    }
    let entries: string[];
    try {
      entries = await readdir(target);
    } catch {
      sendJson(res, 404, []);
      return;
    }
    const files = entries.filter((f) => extname(f).toLowerCase() === ".jpg");
    sendJson(res, 200, files);
  });
}
