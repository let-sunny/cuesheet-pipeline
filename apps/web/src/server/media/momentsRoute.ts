import { readFile } from "node:fs/promises";
import type { ViteDevServer } from "vite";
import { momentsPath } from "./momentsPaths.js";

/** Registers GET /api/moments: the moment palette's rough classification data (moments.json). */
export function registerMomentsRoute(server: ViteDevServer): void {
  server.middlewares.use("/api/moments", async (req, res) => {
    if (req.method !== "GET") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Method not allowed");
      return;
    }
    const p = momentsPath();
    try {
      const json = await readFile(p, "utf8");
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(json);
    } catch {
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end(`Moment data file not found: ${p}`);
    }
  });
}
