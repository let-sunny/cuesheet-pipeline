import { readFile, mkdir, rename, rm } from "node:fs/promises";
import { createWriteStream, existsSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import type { ViteDevServer } from "vite";
import { isWithin, probeDurationSeconds, resolveRepoPath, sendJson } from "../shared.js";

// Extensions accepted for intro/outro file uploads (/api/upload-clip) - not all of clipMimeTypes,
// just these four (mkv etc. are excluded since they're formats browser file inputs' accept="video/*"
// often don't pick up well anyway).
const uploadClipExtensions = new Set([".mp4", ".mov", ".m4v", ".webm"]);
// Upload size cap - intro/outro are whole clips of 15s or less, so this is plenty generous.
// Overridable via registerUploadClipRoute's maxBytes param (tests use a tiny cap to exercise the
// oversize guard without transferring hundreds of MB).
export const DEFAULT_UPLOAD_CLIP_MAX_BYTES = 500 * 1024 * 1024;

/**
 * Registers /api/upload-clip: saves a local file picked via browser file input/drag-and-drop into
 * clipDir (browsers don't expose a file's actual disk path, so uploading is the only route). The
 * saved file name is then reused directly for intro/outro clip selection (onSelectClip).
 */
export function registerUploadClipRoute(server: ViteDevServer, filePath: string, maxBytes: number): void {
  server.middlewares.use("/api/upload-clip", async (req, res) => {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Method not allowed");
      return;
    }

    const rawQuery = (req.url ?? "").split("?")[1] ?? "";
    const filenameParam = new URLSearchParams(rawQuery).get("filename") ?? "";
    const filename = basename(filenameParam);
    if (!filenameParam || filename !== filenameParam || filename === "." || filename === "..") {
      sendJson(res, 400, {
        ok: false,
        error: "filename query parameter is required and must be a plain file name (no path separators)",
      });
      return;
    }
    if (!uploadClipExtensions.has(extname(filename).toLowerCase())) {
      sendJson(res, 400, {
        ok: false,
        error: `Unsupported file type: ${filename} - only .mp4, .mov, .m4v, .webm are accepted, pick a different file`,
      });
      return;
    }

    let clipDir: string;
    try {
      const raw = await readFile(filePath, "utf8");
      const cuesheet = JSON.parse(raw) as { clipDir?: unknown };
      if (typeof cuesheet.clipDir !== "string" || cuesheet.clipDir.length === 0) {
        throw new Error("clipDir missing");
      }
      clipDir = resolveRepoPath(cuesheet.clipDir);
    } catch {
      sendJson(res, 400, {
        ok: false,
        error: "clipDir is not set - set a clip folder in project settings first, then try uploading again",
      });
      return;
    }

    const targetPath = resolve(clipDir, filename);
    if (!isWithin(clipDir, targetPath)) {
      sendJson(res, 400, { ok: false, error: "Invalid filename" });
      return;
    }
    if (existsSync(targetPath)) {
      sendJson(res, 409, {
        ok: false,
        error: `A file named "${filename}" already exists in clipDir - rename the file and try uploading again`,
      });
      return;
    }

    await mkdir(clipDir, { recursive: true });
    const tmpPath = `${targetPath}.upload.tmp`;
    let totalBytes = 0;
    let tooLarge = false;

    try {
      await new Promise<void>((resolvePipe, rejectPipe) => {
        const writeStream = createWriteStream(tmpPath);
        req.on("data", (chunk: Buffer) => {
          totalBytes += chunk.length;
          if (totalBytes > maxBytes && !tooLarge) {
            tooLarge = true;
            // Stop writing to disk without destroying req (IncomingMessage.destroy() tears down
            // the underlying socket, which would kill the connection the 413 response below still
            // needs to be sent on) - just detach the write side and resolve early.
            req.unpipe(writeStream);
            writeStream.destroy();
            resolvePipe();
          }
        });
        writeStream.on("error", rejectPipe);
        writeStream.on("finish", resolvePipe);
        req.on("error", rejectPipe);
        req.pipe(writeStream);
      });
    } catch (e) {
      await rm(tmpPath, { force: true }).catch(() => {});
      sendJson(res, 500, { ok: false, error: `Upload failed: ${(e as Error).message}` });
      return;
    }

    if (tooLarge) {
      await rm(tmpPath, { force: true }).catch(() => {});
      sendJson(res, 413, {
        ok: false,
        error: "File is too large - the upload limit is 500MB, pick a smaller file",
      });
      // Drain whatever body bytes are still arriving so the connection can close/keep-alive cleanly.
      req.resume();
      return;
    }

    try {
      await rename(tmpPath, targetPath);
    } catch (e) {
      await rm(tmpPath, { force: true }).catch(() => {});
      sendJson(res, 500, { ok: false, error: `Upload failed: ${(e as Error).message}` });
      return;
    }

    const durationS = await probeDurationSeconds(targetPath);
    sendJson(res, 200, { ok: true, filename, durationS });
  });
}
