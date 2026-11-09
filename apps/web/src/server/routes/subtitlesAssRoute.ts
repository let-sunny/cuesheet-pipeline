import { readFile } from "node:fs/promises";
import type { ViteDevServer } from "vite";
import { validateCueSheet } from "@cuesheet/schema";
import { buildAss } from "@cuesheet/render";
import { contentDispositionHeader } from "../shared.js";

/**
 * Registers GET /api/subtitles.ass: generates and serves a styled .ass (SubStation Alpha)
 * subtitle file based on the on-disk cuesheet (font/size/color/outline/position/background, not
 * just text+timing like /api/subtitles.srt) — for importing into DaVinci Resolve already styled.
 */
export function registerSubtitlesAssRoute(server: ViteDevServer, filePath: string): void {
  server.middlewares.use("/api/subtitles.ass", async (req, res) => {
    if (req.method !== "GET") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Method not allowed");
      return;
    }

    let parsed: unknown;
    try {
      const raw = await readFile(filePath, "utf8");
      parsed = JSON.parse(raw);
    } catch {
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Cuesheet file not found");
      return;
    }

    const result = validateCueSheet(parsed);
    if (!result.ok) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end(result.errors.join("\n"));
      return;
    }

    const ass = buildAss(result.data);
    const fileName = `${result.data.project.name}.ass`;
    res.setHeader("Content-Type", "text/x-ssa; charset=utf-8");
    res.setHeader("Content-Disposition", contentDispositionHeader("subtitles.ass", fileName));
    res.end(ass, "utf8");
  });
}
