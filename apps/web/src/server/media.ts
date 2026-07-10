import { readFile, stat, mkdir, rename, readdir, rm } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";
import type { ViteDevServer } from "vite";
import {
  clipMimeTypes,
  isWithin,
  probeDurationSeconds,
  repoRoot,
  resolveRepoPath,
  runFfmpeg,
  sendJson,
} from "./shared.js";

// Storage location for 720p H.264 preview proxies, for originals (e.g. 4K HEVC) the browser can't play.
const proxyDir = resolve(repoRoot, "media/proxies");
// Moment palette: storage location for the rough classification data and thumbnail frames.
const draftsRoot = resolve(repoRoot, "media/drafts");
// Disk cache for segment thumbnails (seek-extraction results, used by the edit step's cut list/mini timeline).
const thumbsDir = resolve(repoRoot, "media/.thumbs");

function momentsPath(): string {
  // Defaults to the currently active dataset (dotmix_v4) — when starting the server with a
  // different dataset, set MOMENTS_PATH explicitly.
  return process.env.MOMENTS_PATH ?? resolve(draftsRoot, "dotmix_v4/moments.json");
}

/**
 * Thumbnail frames directory for the moment palette - always the "frames" folder living alongside
 * momentsPath()'s moments.json (same dataset), not a fixed path. This used to be hardcoded to the
 * legacy flat `media/drafts/frames` directory while momentsPath() already defaulted to the
 * dataset-specific `media/drafts/dotmix_v4/moments.json` - most clip folders happened to have
 * identical names in both places, masking the mismatch, but any clip whose frames only exist under
 * the dataset folder (e.g. ones added/regenerated after the v4 dataset was created) 404'd on every
 * card. Deriving this from momentsPath() instead keeps the two in sync automatically, including
 * when MOMENTS_PATH is overridden to a different dataset.
 */
function framesRoot(): string {
  return resolve(dirname(momentsPath()), "frames");
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
 * Registers static/proxy/thumbnail/draft-frames serving middleware, and kicks off background
 * proxy generation for the project's clipDir.
 */
export function registerMediaMiddleware(server: ViteDevServer, filePath: string): void {
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

  // intro/outro are independent file paths unrelated to clipDir, so they're served from a
  // separate route rather than /clips. Relative paths are resolved against the repo root.
  // Only read-only GET/HEAD is allowed. HEAD is used by the web app's own supplementary
  // existence check (see lib/videoSourceError.ts) to distinguish a missing file from one that
  // exists but isn't playable video - it must return the same status/headers as GET, just
  // without a body.
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
}
