import { readFile, writeFile, stat, mkdir, rename, readdir, rm } from "node:fs/promises";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { basename, extname, isAbsolute, relative, resolve, sep } from "node:path";
import type { ViteDevServer } from "vite";
import { findLostFieldPaths, validateCueSheet, type CueSheet } from "@cuesheet/schema";
import { buildRenderPlan, buildSrt } from "@cuesheet/render";
import {
  clipMimeTypes,
  contentDispositionHeader,
  isWithin,
  narrationAudioMimeTypes,
  probeDurationSeconds,
  readRequestBody,
  repoRoot,
  resolveRepoPath,
  sendJson,
} from "./shared.js";
import type { CuesheetWatcher } from "./watch.js";

const renderOutputDir = resolve(repoRoot, "out");

/** Replaces filesystem-unsafe characters so a project name is always a valid single file name, on any platform. */
function sanitizeFileName(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 0 ? cleaned : "export";
}

function renderOutputPathFor(projectName: string): string {
  return resolve(renderOutputDir, `${sanitizeFileName(projectName)}.mp4`);
}

// Extensions accepted for intro/outro file uploads (/api/upload-clip) - not all of clipMimeTypes,
// just these four (mkv etc. are excluded since they're formats browser file inputs' accept="video/*"
// often don't pick up well anyway).
const uploadClipExtensions = new Set([".mp4", ".mov", ".m4v", ".webm"]);
// Upload size cap - intro/outro are whole clips of 15s or less, so this is plenty generous.
// Overridable via registerRoutes' options (tests use a tiny cap to exercise the oversize guard
// without transferring hundreds of MB).
const DEFAULT_UPLOAD_CLIP_MAX_BYTES = 500 * 1024 * 1024;

export interface RegisterRoutesOptions {
  uploadClipMaxBytes?: number;
  /** Root directory /api/bgm-files scans recursively (default: repo-root media/). Overridable for tests. */
  mediaRoot?: string;
}

// Minimal flag to block concurrent requests while a render is in progress (no queuing).
let renderInProgress = false;

// Remembers the project name + subtitle-burn option + output path of the last successfully
// completed render, so /out.mp4 can name the download after the project (mirrors
// /api/subtitles.srt) instead of a generic "out.mp4", and can find the right file under out/.
let lastRenderName: string | null = null;
let lastRenderBurnSubtitles = true;
let lastRenderOutputPath: string | null = null;

interface RenderJobState {
  state: "idle" | "running" | "done" | "error";
  progress: number;
  /** Short, extracted summary of the failure - what the client shows in the toast/banner. */
  error?: string;
  /** Full raw ffmpeg stderr dump, for a collapsible "show details" section on the client. */
  errorDetail?: string;
}

/**
 * ffmpeg fatal-error line patterns, checked from the end of stderr backwards - ffmpeg has no
 * single consistent "the error is on this line" convention, so this is a best-effort summary for
 * the toast/banner (previously the raw ~2000-char stderr dump was shown in both the toast AND the
 * persistent banner at once, which read as duplicated wall-of-text). Falls back to the last
 * non-empty line if nothing matches; the full dump stays available in the collapsible detail for
 * whatever this heuristic misses.
 */
const FFMPEG_ERROR_LINE_PATTERNS = [
  /^\[.*\] Error .*/,
  /No such file or directory/,
  /Invalid data found when processing input/,
  /Unknown encoder/,
  /Unsupported codec/,
  /Conversion failed!/,
  /Error while (opening|filtering|decoding|encoding|muxing)/,
  /Permission denied/,
];

export function extractFfmpegErrorSummary(stderr: string): string {
  const lines = stderr
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i]!;
    if (FFMPEG_ERROR_LINE_PATTERNS.some((p) => p.test(line))) {
      return line;
    }
  }
  return lines[lines.length - 1] ?? "Unknown ffmpeg error";
}

// State of the last (or currently running) render job. Since only one job exists at a time, a single
// module-scope variable is enough without a separate store (history management is out of scope).
let renderJob: RenderJobState = { state: "idle", progress: 0 };
let renderJobCounter = 0;

// Parses "time=HH:MM:SS.ms" out of an ffmpeg stderr line, in seconds.
function parseFfmpegTimeSeconds(text: string): number | null {
  const m = text.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) {
    return null;
  }
  const [, hh, mm, ss] = m as unknown as [string, string, string, string];
  return Number(hh) * 3600 + Number(mm) * 60 + Number(ss);
}

/**
 * Approximate total output duration (seconds) used to compute progress.
 * Only sums segment (out-in)/speed and ignores intro/outro since their length is unknown without
 * probing the file (this is just an approximation for the progress display, so it may differ slightly
 * from the actual render output length).
 */
function estimateOutputSeconds(cue: CueSheet): number {
  return cue.segments.reduce((sum, s) => sum + (s.out - s.in) / s.speed, 0);
}

/** Reads narration.dir from the cuesheet file and resolves it to an absolute path (relative paths are based on the repo root). */
async function readNarrationDir(cuesheetFilePath: string): Promise<string | null> {
  try {
    const raw = await readFile(cuesheetFilePath, "utf8");
    const cuesheet = JSON.parse(raw) as { narration?: { dir?: unknown } };
    const dir = cuesheet.narration?.dir;
    if (typeof dir !== "string" || dir.length === 0) {
      return null;
    }
    return isAbsolute(dir) ? dir : resolve(repoRoot, dir);
  } catch {
    return null;
  }
}

/**
 * Recursively (up to maxDepth extra levels) collects audio files under dir for the /api/bgm-files
 * listing — keyed by absolute path (dedup, since clipDir and media/ can overlap) to a display path
 * that's repo-root-relative POSIX (e.g. "media/bgm/lofi.mp3", matching the convention bgm.file is
 * already stored as) when the file lives inside the repo, or the absolute path otherwise (e.g.
 * clipDir on an external/iCloud drive) — both forms are valid as-is for ffmpeg -i and for the
 * stream endpoint below.
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

/**
 * Registers the cuesheet API route handlers: cuesheet GET/POST, render + render-status,
 * subtitles.srt, upload-clip, clip-files, bgm-files, narration-files, and the render output
 * download route.
 */
export function registerRoutes(
  server: ViteDevServer,
  filePath: string,
  watcher: CuesheetWatcher,
  options: RegisterRoutesOptions = {},
): void {
  const uploadClipMaxBytes = options.uploadClipMaxBytes ?? DEFAULT_UPLOAD_CLIP_MAX_BYTES;
  const mediaRoot = options.mediaRoot ?? resolve(repoRoot, "media");

  server.middlewares.use("/api/cuesheet", async (req, res) => {
    if (req.method === "GET") {
      try {
        const json = await readFile(filePath, "utf8");
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(json);
      } catch {
        res.statusCode = 404;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end("No draft yet - run pnpm episode with a source folder to generate one automatically.");
      }
      return;
    }

    if (req.method === "POST" || req.method === "PUT") {
      let parsed: unknown;
      try {
        const body = await readRequestBody(req);
        parsed = JSON.parse(body);
      } catch {
        sendJson(res, 400, {
          ok: false,
          errors: ["(root): request body is not valid JSON"],
        });
        return;
      }

      const result = validateCueSheet(parsed);
      if (!result.ok) {
        sendJson(res, 400, { ok: false, errors: result.errors });
        return;
      }

      // A zod object silently strips undefined keys by default. If the server is still running
      // an old schema version and a request carrying a new field (e.g. crop) is saved as-is,
      // that field would already be missing from result.data and get permanently baked into
      // disk (silent data loss). Before saving, compare the key set of the original body against
      // the serialized result, and refuse to save if any path is missing — a loss means an old
      // schema, so requiring a server restart (schema refresh) is the right call.
      const lostPaths = findLostFieldPaths(parsed, result.data);
      if (lostPaths.length > 0) {
        sendJson(res, 400, {
          ok: false,
          errors: [
            `The save system needs an update - restart the server and try again (lost fields: ${lostPaths.join(", ")})`,
          ],
        });
        return;
      }

      const content = `${JSON.stringify(result.data, null, 2)}\n`;
      watcher.markOwnWrite(content);
      await writeFile(filePath, content, "utf8");
      sendJson(res, 200, { ok: true, data: result.data });
      return;
    }

    res.statusCode = 405;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Method not allowed");
  });

  // Handles the narration audio file list (/api/narration-files) + preview streaming
  // (/api/narration-files/<filename>) under the same mount path. Since connect strips the mount
  // prefix, the two behaviors are distinguished by whether there's a sub-path.
  server.middlewares.use("/api/narration-files", async (req, res) => {
    if (req.method !== "GET") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Method not allowed");
      return;
    }

    // If a dir query is present, it takes priority — since a folder path currently being edited
    // but not yet saved must still be reflected immediately in the list/preview, this doesn't
    // rely solely on the on-disk cuesheet's narration.dir (which is only updated after a save).
    const [rawUrlPath = "", rawQuery = ""] = (req.url ?? "").split("?");
    const dirParam = new URLSearchParams(rawQuery).get("dir");
    const narrationDir =
      dirParam && dirParam.length > 0 ? resolveRepoPath(dirParam) : await readNarrationDir(filePath);
    const rawSub = decodeURIComponent(rawUrlPath.replace(/^\/+/, ""));

    if (rawSub) {
      // Preview streaming: /api/narration-files/<filename>
      if (!narrationDir || rawSub !== basename(rawSub)) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end("File not found");
        return;
      }
      const mime = narrationAudioMimeTypes[extname(rawSub).toLowerCase()];
      const targetPath = resolve(narrationDir, rawSub);
      if (!mime || !isWithin(narrationDir, targetPath) || !existsSync(targetPath)) {
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

    // File listing: /api/narration-files
    if (!narrationDir) {
      sendJson(res, 200, {
        files: [],
        note: "Narration folder is not set (enable narration and specify a folder)",
      });
      return;
    }
    let entries: string[];
    try {
      entries = await readdir(narrationDir);
    } catch {
      sendJson(res, 200, {
        files: [],
        note: `Folder not found: ${narrationDir} (create the folder and add audio files)`,
      });
      return;
    }
    const audioNames = entries.filter(
      (name) => narrationAudioMimeTypes[extname(name).toLowerCase()] !== undefined,
    );
    const files = await Promise.all(
      audioNames.map(async (name) => ({
        name,
        durationS: await probeDurationSeconds(resolve(narrationDir, name)),
      })),
    );
    sendJson(res, 200, { files });
  });

  // List of video files inside clipDir (+ffprobe duration), for picking an intro/outro.
  // Same pattern as the narration-files endpoint: reads disk on every request for an always-fresh listing.
  server.middlewares.use("/api/clip-files", async (req, res) => {
    if (req.method !== "GET") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Method not allowed");
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
      sendJson(res, 200, { files: [], note: "clipDir is not set" });
      return;
    }
    let entries: string[];
    try {
      entries = await readdir(clipDir);
    } catch {
      sendJson(res, 200, {
        files: [],
        note: `Folder not found: ${clipDir} (the path may be broken due to an iCloud folder rename/move, etc.)`,
      });
      return;
    }
    const videoNames = entries
      .filter((name) => clipMimeTypes[extname(name).toLowerCase()] !== undefined)
      .sort((a, b) => a.localeCompare(b));
    const files = await Promise.all(
      videoNames.map(async (name) => {
        const p = resolve(clipDir, name);
        let s;
        try {
          s = await stat(p);
        } catch {
          return { name, durationS: null };
        }
        if (s.blocks === 0) {
          // Skip cloud-only placeholders (e.g. iCloud) since running ffprobe on them hangs indefinitely.
          return { name, durationS: null };
        }
        return { name, durationS: await probeDurationSeconds(p) };
      }),
    );
    sendJson(res, 200, { files });
  });

  // List of audio files usable as background music (Edit step BGM gutter's file picker):
  // repo-root media/ (recursively, a few levels deep - bgm conventionally lives under
  // media/bgm/) plus clipDir itself (non-recursive, in case music was captured alongside the
  // source clips). Same read-disk-every-request pattern as narration/clip-files. Preview
  // streaming shares the same mount path (/api/bgm-files/stream?path=...), same
  // "sub-path selects the behavior" convention as narration-files.
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

  // Saves a local file picked via browser file input/drag-and-drop into clipDir (browsers don't
  // expose a file's actual disk path, so uploading is the only route). The saved file name is
  // then reused directly for intro/outro clip selection (onSelectClip).
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
          if (totalBytes > uploadClipMaxBytes && !tooLarge) {
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

  // Generates and serves an SRT subtitle file based on the on-disk cuesheet (for YouTube CC tracks).
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

  // Mind the registration order: this must be registered before "/api/render" so that
  // "/api/render/status" is handled before it gets caught by "/api/render"'s prefix match.
  server.middlewares.use("/api/render/status", (req, res) => {
    if (req.method !== "GET") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Method not allowed");
      return;
    }
    sendJson(res, 200, {
      state: renderJob.state,
      progress: renderJob.progress,
      error: renderJob.error,
      errorDetail: renderJob.errorDetail,
      outputReady: renderJob.state === "done" && lastRenderOutputPath !== null && existsSync(lastRenderOutputPath),
    });
  });

  server.middlewares.use("/api/render", async (req, res) => {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Method not allowed");
      return;
    }

    if (renderInProgress) {
      sendJson(res, 409, { ok: false, error: "A render is already in progress" });
      return;
    }

    // Subtitle burn-in option (default true) — {"burnSubtitles": false} produces a clean video for CC/SRT use.
    let burnSubtitles = true;
    try {
      const body = await readRequestBody(req);
      if (body.trim().length > 0) {
        const requestBody = JSON.parse(body) as { burnSubtitles?: unknown };
        if (typeof requestBody.burnSubtitles === "boolean") {
          burnSubtitles = requestBody.burnSubtitles;
        }
      }
    } catch {
      // Use the default (true) if the body is missing or unparseable.
    }

    let parsed: unknown;
    try {
      const raw = await readFile(filePath, "utf8");
      parsed = JSON.parse(raw);
    } catch {
      sendJson(res, 400, {
        ok: false,
        error: "(root): could not read or parse the cuesheet file",
      });
      return;
    }

    const result = validateCueSheet(parsed);
    if (!result.ok) {
      sendJson(res, 400, { ok: false, error: result.errors.join("\n") });
      return;
    }

    // Responds with jobId as soon as validation passes, and runs ffmpeg in the background,
    // updating only the progress in renderJob (doesn't make the caller wait — prevents blocking
    // for the several minutes a render can take).
    renderInProgress = true;
    renderJobCounter += 1;
    const jobId = String(renderJobCounter);
    const totalSeconds = estimateOutputSeconds(result.data);
    renderJob = { state: "running", progress: 0 };

    // ffmpeg runs inheriting this vite server's cwd (packages/web) as-is, so if clipDir is a
    // relative path, convert it to an absolute path based on the repo root before passing it in.
    const cueForRender = { ...result.data, clipDir: resolveRepoPath(result.data.clipDir) };
    const outputPath = renderOutputPathFor(result.data.project.name);
    await mkdir(renderOutputDir, { recursive: true });
    const plan = buildRenderPlan(cueForRender, outputPath, { burnSubtitles });
    for (const warning of plan.warnings) {
      server.config.logger.warn(`[render] ${warning}`);
    }
    const proc = spawn("ffmpeg", plan.args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stdout?.on("data", () => {});
    proc.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stderr += text;
      const seconds = parseFfmpegTimeSeconds(text);
      if (seconds != null && totalSeconds > 0) {
        const pct = Math.min(99, Math.round((seconds / totalSeconds) * 100));
        renderJob = { state: "running", progress: pct };
      }
    });
    proc.on("error", (e) => {
      renderInProgress = false;
      renderJob = {
        state: "error",
        progress: renderJob.progress,
        error: `ffmpeg failed to start (is it installed?): ${e.message}`,
      };
    });
    proc.on("exit", (code) => {
      renderInProgress = false;
      if (code === 0) {
        renderJob = { state: "done", progress: 100 };
        lastRenderName = result.data.project.name;
        lastRenderBurnSubtitles = burnSubtitles;
        lastRenderOutputPath = outputPath;
      } else {
        renderJob = {
          state: "error",
          progress: renderJob.progress,
          error: extractFfmpegErrorSummary(stderr),
          errorDetail: stderr.slice(-4000),
        };
      }
    });

    sendJson(res, 200, { ok: true, jobId });
  });

  server.middlewares.use("/out.mp4", (req, res) => {
    if (req.method !== "GET") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Method not allowed");
      return;
    }

    if (!lastRenderOutputPath || !existsSync(lastRenderOutputPath)) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Render output not found");
      return;
    }

    const baseName = lastRenderName ?? "export";
    const fileName = lastRenderBurnSubtitles ? `${baseName}.mp4` : `${baseName} (no subtitles).mp4`;
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Disposition", contentDispositionHeader("export.mp4", fileName));
    createReadStream(lastRenderOutputPath).pipe(res);
  });
}
