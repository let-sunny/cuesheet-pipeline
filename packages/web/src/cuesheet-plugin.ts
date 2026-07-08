import { readFile, writeFile, stat, mkdir, rename, readdir, rm } from "node:fs/promises";
import { createReadStream, createWriteStream, existsSync, mkdirSync, watch, type FSWatcher } from "node:fs";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { findLostFieldPaths, validateCueSheet, type CueSheet } from "@cuesheet/schema";
import { buildRenderPlan, buildSrt } from "@cuesheet/render";

const here = dirname(fileURLToPath(import.meta.url));
// src -> web -> packages -> repo root
const repoRoot = resolve(here, "../../..");
const renderOutputPath = resolve(repoRoot, "out.mp4");
// Storage location for 720p H.264 preview proxies, for originals (e.g. 4K HEVC) the browser can't play.
const proxyDir = resolve(repoRoot, "media/proxies");
// Moment palette: storage location for the rough classification data and thumbnail frames.
const draftsRoot = resolve(repoRoot, "media/drafts");
const framesRoot = resolve(draftsRoot, "frames");
// Disk cache for segment thumbnails (seek-extraction results, used by the edit step's cut list/mini timeline).
const thumbsDir = resolve(repoRoot, "media/.thumbs");

function cuesheetPath(): string {
  return process.env.CUESHEET_PATH ?? resolve(repoRoot, "project.cuesheet.json");
}

function momentsPath(): string {
  // Defaults to the currently active dataset (dotmix_v4) — when starting the server with a
  // different dataset, set MOMENTS_PATH explicitly.
  return process.env.MOMENTS_PATH ?? resolve(draftsRoot, "dotmix_v4/moments.json");
}

/** Checks whether target is inside root (including root itself) — prevents path escape. */
function isWithin(root: string, target: string): boolean {
  return target === root || target.startsWith(root + sep);
}

// Minimal flag to block concurrent requests while a render is in progress (no queuing).
let renderInProgress = false;

// Remembers the project name + subtitle-burn option of the last successfully completed render,
// so /out.mp4 can name the download after the project (mirrors /api/subtitles.srt) instead of a
// generic "out.mp4".
let lastRenderName: string | null = null;
let lastRenderBurnSubtitles = true;

interface RenderJobState {
  state: "idle" | "running" | "done" | "error";
  progress: number;
  error?: string;
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

function runFfmpeg(args: string[]): Promise<{ code: number | null; stderr: string }> {
  return new Promise((res) => {
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stdout?.on("data", () => {});
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    proc.on("error", (e) => {
      res({ code: null, stderr: `ffmpeg failed to start (is it installed?): ${e.message}` });
    });
    proc.on("exit", (code) => {
      res({ code, stderr });
    });
  });
}

/** Reads duration via ffprobe. Returns null on failure (unparseable / <= 0 / process error). */
function probeDurationSeconds(path: string): Promise<number | null> {
  return new Promise((res) => {
    const proc = spawn(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", path],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    proc.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    proc.on("error", () => res(null));
    proc.on("exit", (code) => {
      if (code !== 0) {
        res(null);
        return;
      }
      const duration = Number(stdout.trim());
      res(Number.isFinite(duration) && duration > 0 ? duration : null);
    });
  });
}

/**
 * Filters out corrupted video files, e.g. ones that have only a moov with no track data.
 * Duration alone would pass such files, but there were real cases where the middle of the stream
 * was broken (NAL errors, etc.) and seeking failed — so on top of the duration check, this also
 * seeks 2 seconds into the file's tail (the 70% mark) and decodes it to verify exit 0 and empty
 * stderr (decode verification).
 * This function is always called only in the background (generateProxies, never blocking server startup).
 */
async function isValidVideoFile(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    if (s.size === 0) {
      return false;
    }
  } catch {
    return false;
  }
  const duration = await probeDurationSeconds(path);
  if (duration === null) {
    return false;
  }
  // "-v error" was observed to silently return exit 0 (missing the corruption) even when the tail is
  // entirely cut off and decoding yields 0 frames (ffmpeg logs this only at warning level, not error
  // — e.g. "Output file is empty"). Raising it to "-v warning" is what makes this warning show up in stderr.
  const { code, stderr } = await runFfmpeg([
    "-v",
    "warning",
    "-ss",
    String(duration * 0.7),
    "-t",
    "2",
    "-i",
    path,
    "-f",
    "null",
    "-",
  ]);
  return code === 0 && stderr.trim() === "";
}

const clipMimeTypes: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".m4v": "video/x-m4v",
};

const narrationAudioMimeTypes: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".wav": "audio/wav",
};

// Extensions accepted for intro/outro file uploads (/api/upload-clip) - not all of clipMimeTypes,
// just these four (mkv etc. are excluded since they're formats browser file inputs' accept="video/*"
// often don't pick up well anyway).
const uploadClipExtensions = new Set([".mp4", ".mov", ".m4v", ".webm"]);
// Upload size cap - intro/outro are whole clips of 15s or less, so this is plenty generous.
const uploadClipMaxBytes = 500 * 1024 * 1024;

/** Resolves a relative path stored in the cuesheet (e.g. clipDir) to an absolute path based on the repo root (so it doesn't break if the folder moves). */
function resolveRepoPath(dir: string): string {
  return isAbsolute(dir) ? dir : resolve(repoRoot, dir);
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

function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((res, rej) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString("utf8");
    });
    req.on("end", () => res(body));
    req.on("error", rej);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

/**
 * Builds a Content-Disposition header value that downloads as fallbackAsciiName in browsers
 * that only understand the plain `filename` param, and as unicodeName (URI-encoded via the
 * `filename*` param, RFC 5987) elsewhere — this project's file names are usually Korean, so
 * unicodeName is normally what actually shows up in the saved file.
 */
function contentDispositionHeader(fallbackAsciiName: string, unicodeName: string): string {
  return `attachment; filename="${fallbackAsciiName}"; filename*=UTF-8''${encodeURIComponent(unicodeName)}`;
}

// A proxy's file name is the original file name with only the extension unified to .mp4.
function proxyFileName(originalName: string): string {
  return `${basename(originalName, extname(originalName))}.mp4`;
}

interface ProxyQueueState {
  /** Original clip file names that haven't started processing yet (in wait order). */
  pending: string[];
  /** Original clip file name currently being turned into a proxy, or null if none. */
  generating: string | null;
}

// State of the proxy generation queue — exposed via GET /api/proxy-status so the edit screen can
// show a "generating proxies" notice.
let proxyQueueState: ProxyQueueState = { pending: [], generating: null };

/**
 * For local video files that physically exist in clipDir, generates a 720p H.264 preview proxy
 * sequentially (one at a time) if it's missing or older than the original.
 * Run in the background without awaiting at the call site, so it doesn't block server startup.
 */
async function generateProxies(clipDir: string, log: (msg: string) => void): Promise<void> {
  await mkdir(proxyDir, { recursive: true });

  let entries: string[];
  try {
    entries = await readdir(clipDir);
  } catch {
    return;
  }

  const videoFiles = entries.filter((name) => clipMimeTypes[extname(name).toLowerCase()] !== undefined);

  const targets: { src: string; proxyPath: string; tmpPath: string }[] = [];
  for (const name of videoFiles) {
    const srcPath = resolve(clipDir, name);
    let srcStat;
    try {
      srcStat = await stat(srcPath);
    } catch {
      continue;
    }
    if (srcStat.blocks === 0) {
      // Skip cloud-only placeholders (e.g. iCloud) since reading them hangs indefinitely.
      continue;
    }

    const proxyPath = resolve(proxyDir, proxyFileName(name));
    let needsGenerate = true;
    try {
      const proxyStat = await stat(proxyPath);
      if (proxyStat.mtimeMs >= srcStat.mtimeMs) {
        // Also do a light integrity check on an existing proxy — if a previous run died midway,
        // leaving a corrupted file with a moov but no track data, put it back on the regen queue.
        needsGenerate = !(await isValidVideoFile(proxyPath));
      }
    } catch {
      // Proxy doesn't exist yet -> needs generating
    }
    if (needsGenerate) {
      targets.push({ src: srcPath, proxyPath, tmpPath: `${proxyPath}.tmp` });
    }
  }

  proxyQueueState = { pending: targets.map((t) => basename(t.src)), generating: null };

  const total = targets.length;
  for (let i = 0; i < targets.length; i += 1) {
    const target = targets[i]!;
    const name = basename(target.src);
    proxyQueueState = { pending: targets.slice(i + 1).map((t) => basename(t.src)), generating: name };
    log(`Generating proxy (${i + 1}/${total}): ${name}`);

    // Up to 2 attempts: after generating (before rename), verify duration via ffprobe — if the file
    // is corrupted, delete and retry; if the second attempt is also corrupted, just log and skip
    // (falls back to serving the original).
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const { code, stderr } = await runFfmpeg([
        "-y",
        "-i",
        target.src,
        "-vf",
        "scale=1280:-2",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "26",
        "-g",
        "30",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "96k",
        "-movflags",
        "+faststart",
        "-f",
        "mp4",
        target.tmpPath,
      ]);
      if (code !== 0) {
        console.error(`Proxy generation failed, continuing to serve the original: ${name}\n${stderr.slice(-500)}`);
        break;
      }
      if (!(await isValidVideoFile(target.tmpPath))) {
        await rm(target.tmpPath, { force: true }).catch(() => {});
        if (attempt < 2) {
          console.error(`Proxy output is corrupted, retrying (${attempt}/2): ${name}`);
          continue;
        }
        console.error(`Proxy output is still corrupted after retry, skipping: ${name}`);
        break;
      }
      try {
        await rename(target.tmpPath, target.proxyPath);
      } catch (e) {
        console.error(`Failed to move proxy file: ${name}`, e);
      }
      break;
    }
  }
  proxyQueueState = { pending: [], generating: null };
}

// Dedup map preventing ffmpeg from running twice for overlapping requests for the same (clip, time) thumbnail.
const thumbInFlight = new Map<string, Promise<boolean>>();

// Max 2 concurrent thumbnail ffmpeg runs — excess requests wait serially in a queue.
let thumbActiveCount = 0;
const thumbWaitQueue: (() => void)[] = [];

async function acquireThumbSlot(): Promise<void> {
  if (thumbActiveCount >= 2) {
    await new Promise<void>((res) => thumbWaitQueue.push(res));
  }
  thumbActiveCount += 1;
}

function releaseThumbSlot(): void {
  thumbActiveCount -= 1;
  const next = thumbWaitQueue.shift();
  next?.();
}

/** Seeks to the t-second mark in the proxy, extracts one frame, and saves it to cachePath. */
async function generateThumbnail(
  proxyPath: string,
  t: number,
  width: number,
  cachePath: string,
): Promise<boolean> {
  await acquireThumbSlot();
  try {
    const tmpPath = `${cachePath}.tmp`;
    const { code } = await runFfmpeg([
      "-ss",
      String(t),
      "-i",
      proxyPath,
      "-frames:v",
      "1",
      "-vf",
      `scale=${width}:-2`,
      // tmpPath has ".tmp" appended for atomic writes, so the format can't be inferred from the
      // extension — specify it explicitly.
      "-f",
      "mjpeg",
      "-y",
      tmpPath,
    ]);
    if (code !== 0) {
      return false;
    }
    await rename(tmpPath, cachePath);
    return true;
  } catch {
    return false;
  } finally {
    releaseThumbSlot();
  }
}

/** Dedups by key (clipStem_roundedTime_width), generating only if not already cached. */
async function getOrGenerateThumb(
  key: string,
  proxyPath: string,
  t: number,
  width: number,
  cachePath: string,
): Promise<boolean> {
  let promise = thumbInFlight.get(key);
  if (!promise) {
    promise = generateThumbnail(proxyPath, t, width, cachePath).finally(() => {
      thumbInFlight.delete(key);
    });
    thumbInFlight.set(key, promise);
  }
  return promise;
}

/**
 * Attaches to the dev server: middleware that serves/saves the cuesheet file, middleware that
 * statically serves clips, and an HMR custom event that detects file changes and notifies the client.
 */
export function cuesheetPlugin(): Plugin {
  return {
    name: "cuesheet-plugin",
    configureServer(server) {
      const filePath = cuesheetPath();
      // The last content the server itself wrote. If this matches inside the fs.watch callback,
      // the event was caused by our own save, so don't notify the client.
      let lastWrittenContent: string | null = null;

      // Run proxy generation in the background so it doesn't block server startup.
      void (async () => {
        let clipDir: string;
        try {
          const raw = await readFile(filePath, "utf8");
          const cuesheet = JSON.parse(raw) as { clipDir?: unknown };
          if (typeof cuesheet.clipDir !== "string" || cuesheet.clipDir.length === 0) {
            return;
          }
          clipDir = resolveRepoPath(cuesheet.clipDir);
        } catch {
          return;
        }
        await generateProxies(clipDir, (msg) => server.config.logger.info(msg));
      })();

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
          lastWrittenContent = content;
          await writeFile(filePath, content, "utf8");
          sendJson(res, 200, { ok: true, data: result.data });
          return;
        }

        res.statusCode = 405;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end("Method not allowed");
      });

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
          dirParam && dirParam.length > 0
            ? isAbsolute(dirParam)
              ? dirParam
              : resolve(repoRoot, dirParam)
            : await readNarrationDir(filePath);
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
          const targetPath = pathParam ? (isAbsolute(pathParam) ? pathParam : resolve(repoRoot, pathParam)) : null;
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
        await collectAudioFiles(resolve(repoRoot, "media"), 3, found);
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
        req.on("data", (chunk: Buffer) => {
          totalBytes += chunk.length;
          if (totalBytes > uploadClipMaxBytes) {
            req.destroy(new Error("payload too large"));
          }
        });

        try {
          await pipeline(req, createWriteStream(tmpPath));
        } catch (e) {
          await rm(tmpPath, { force: true }).catch(() => {});
          if (totalBytes > uploadClipMaxBytes) {
            sendJson(res, 413, {
              ok: false,
              error: "File is too large - the upload limit is 500MB, pick a smaller file",
            });
          } else {
            sendJson(res, 500, { ok: false, error: `Upload failed: ${(e as Error).message}` });
          }
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

      // intro/outro are independent file paths unrelated to clipDir, so they're served from a
      // separate route rather than /clips. Relative paths are resolved against the repo root.
      // Only read-only GET is allowed.
      server.middlewares.use("/api/local-video", async (req, res) => {
        if (req.method !== "GET") {
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
        const targetPath = isAbsolute(requestedPath) ? requestedPath : resolve(repoRoot, requestedPath);
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
          outputReady: renderJob.state === "done" && existsSync(renderOutputPath),
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
        const plan = buildRenderPlan(cueForRender, renderOutputPath, { burnSubtitles });
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
          } else {
            renderJob = { state: "error", progress: renderJob.progress, error: stderr.slice(-2000) };
          }
        });

        sendJson(res, 200, { ok: true, jobId });
      });

      server.middlewares.use("/api/proxy-status", (req, res) => {
        if (req.method !== "GET") {
          res.statusCode = 405;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("Method not allowed");
          return;
        }
        sendJson(res, 200, proxyQueueState);
      });

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
        const target = resolve(framesRoot, rawPath);
        if (!rawPath || !isWithin(framesRoot, target) || extname(target).toLowerCase() !== ".jpg") {
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
        const target = resolve(framesRoot, folder);
        if (!folder || folder.includes("/") || !isWithin(framesRoot, target)) {
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

      // Segment thumbnail: /api/thumb?clip=<original filename>&t=<seconds>&w=<width px, default 160>
      // — seeks to that time in the proxy and returns the extracted frame as a jpg. 404 if there's no
      // proxy (the client draws a placeholder). The cache key rounds t to the nearest 0.5s to reduce
      // cache misses/duplicate generation from slightly different t values during dragging. Width is
      // also part of the cache key (a separate file per w), so the same (clip, time) is regenerated
      // if the requested width differs (used for larger thumbnails like the subtitle style preview).
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

      server.middlewares.use("/out.mp4", (req, res) => {
        if (req.method !== "GET") {
          res.statusCode = 405;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("Method not allowed");
          return;
        }

        if (!existsSync(renderOutputPath)) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("Render output not found");
          return;
        }

        const baseName = lastRenderName ?? "export";
        const fileName = lastRenderBurnSubtitles ? `${baseName}.mp4` : `${baseName} (no subtitles).mp4`;
        res.setHeader("Content-Type", "video/mp4");
        res.setHeader("Content-Disposition", contentDispositionHeader("export.mp4", fileName));
        createReadStream(renderOutputPath).pipe(res);
      });

      // Detects cuesheet file changes -> notifies the client via an HMR custom event.
      // The file may not exist yet at server startup (e.g. `pnpm episode` starts the server first
      // and the /episode pipeline generates the cuesheet later). In that case, watch the parent
      // directory instead of the file, and switch to watching the file the moment it appears. If the
      // file gets deleted and recreated (a rename event), the same switch-over logic reattaches so
      // the watch never ends up orphaned.
      let watcher: FSWatcher | null = null;

      const notifyChanged = () => {
        server.ws.send({ type: "custom", event: "cuesheet:changed" });
      };

      const watchFile = () => {
        watcher?.close();
        watcher = watch(filePath, () => {
          void (async () => {
            if (!existsSync(filePath)) {
              // Deleted (a rename event) - switch to watching the directory, waiting for it to be
              // recreated, and notify the client so it refetches and shows the empty-state banner.
              watchDir();
              notifyChanged();
              return;
            }
            let current: string;
            try {
              current = await readFile(filePath, "utf8");
            } catch {
              return;
            }
            if (current === lastWrittenContent) {
              // This is exactly what this server just saved, so don't notify about an external change.
              return;
            }
            notifyChanged();
          })();
        });
      };

      const watchDir = () => {
        watcher?.close();
        const dir = dirname(filePath);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
        const targetName = basename(filePath);
        watcher = watch(dir, (_eventType, changedName) => {
          if (changedName !== targetName || !existsSync(filePath)) {
            return;
          }
          // The target file has appeared - switch to watching the file and tell the client to load it for the first time.
          watchFile();
          notifyChanged();
        });
      };

      if (existsSync(filePath)) {
        watchFile();
      } else {
        watchDir();
      }
      server.httpServer?.once("close", () => watcher?.close());
    },
  };
}
