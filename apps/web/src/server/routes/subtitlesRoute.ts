import { readFile } from "node:fs/promises";
import type { ViteDevServer } from "vite";
import { validateCueSheet } from "@cuesheet/schema";
import { buildSrt } from "@cuesheet/render";
import { contentDispositionHeader } from "../shared.js";

/** Registers GET /api/subtitles.srt: generates and serves an SRT subtitle file based on the on-disk cuesheet (for YouTube CC tracks). */
export function registerSubtitlesRoute(server: ViteDevServer, filePath: string): void {
  server.middlewares.use("/api/subtitles.srt", async (req, res) => {
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

    const srt = buildSrt(result.data);
    const fileName = `${result.data.project.name}.srt`;
    res.setHeader("Content-Type", "application/x-subrip; charset=utf-8");
    res.setHeader("Content-Disposition", contentDispositionHeader("subtitles.srt", fileName));
    res.end(srt, "utf8");
  });
}
