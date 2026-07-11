import { readFile, rm } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";
import type { ViteDevServer } from "vite";
import { contentDispositionHeader, isWithin, resolveRepoPath, runFfmpeg, sendJson } from "../shared.js";
import { formatMinSec } from "./fileNaming.js";
import { extractFfmpegErrorSummary } from "./renderProgress.js";

/**
 * Registers /api/frame-capture: captures a single full-resolution frame from the ORIGINAL clip
 * (not the 720p preview proxy — thumbnail candidates need source pixels) via seek-based ffmpeg
 * (-ss before -i, fast even on a long clip). /api/frame-capture?clip=<name>&atS=<source-seconds>
 */
export function registerFrameCaptureRoute(server: ViteDevServer, filePath: string): void {
  server.middlewares.use("/api/frame-capture", async (req, res) => {
    if (req.method !== "GET") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Method not allowed");
      return;
    }

    const rawQuery = (req.url ?? "").split("?")[1] ?? "";
    const params = new URLSearchParams(rawQuery);
    const clipParam = params.get("clip") ?? "";
    const atSParam = params.get("atS");
    const atS = atSParam !== null ? Number(atSParam) : NaN;

    if (!clipParam || clipParam !== basename(clipParam)) {
      sendJson(res, 400, {
        ok: false,
        error: "clip query parameter is required and must be a plain file name (no path separators)",
      });
      return;
    }
    if (!Number.isFinite(atS) || atS < 0) {
      sendJson(res, 400, {
        ok: false,
        error: "atS query parameter must be a non-negative number (seconds)",
      });
      return;
    }

    let clipDir: string;
    let projectName: string;
    try {
      const raw = await readFile(filePath, "utf8");
      const cuesheet = JSON.parse(raw) as { clipDir?: unknown; project?: { name?: unknown } };
      if (typeof cuesheet.clipDir !== "string" || cuesheet.clipDir.length === 0) {
        throw new Error("clipDir missing");
      }
      clipDir = resolveRepoPath(cuesheet.clipDir);
      projectName = typeof cuesheet.project?.name === "string" ? cuesheet.project.name : "export";
    } catch {
      sendJson(res, 400, {
        ok: false,
        error: "clipDir is not set - set a clip folder in project settings first, then try again",
      });
      return;
    }

    const originalPath = resolve(clipDir, clipParam);
    if (!isWithin(clipDir, originalPath) || !existsSync(originalPath)) {
      sendJson(res, 404, {
        ok: false,
        error: `Clip not found in clipDir: ${clipParam} - make sure the file exists in the configured clip folder`,
      });
      return;
    }

    const tmpPath = resolve(tmpdir(), `frame-capture-${randomUUID()}.png`);
    const { code, stderr } = await runFfmpeg(["-ss", String(atS), "-i", originalPath, "-frames:v", "1", "-y", tmpPath]);
    if (code !== 0 || !existsSync(tmpPath)) {
      await rm(tmpPath, { force: true }).catch(() => {});
      sendJson(res, 500, { ok: false, error: `Frame capture failed: ${extractFfmpegErrorSummary(stderr)}` });
      return;
    }

    const fileName = `${projectName} ${formatMinSec(atS)}.png`;
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Disposition", contentDispositionHeader("frame.png", fileName));
    const stream = createReadStream(tmpPath);
    stream.pipe(res);
    stream.on("close", () => {
      rm(tmpPath, { force: true }).catch(() => {});
    });
  });
}
