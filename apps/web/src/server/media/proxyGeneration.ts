import { stat, mkdir, rename, readdir, rm } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { clipMimeTypes, probeDurationSeconds, repoRoot, runFfmpeg } from "../shared.js";

// Storage location for 720p H.264 preview proxies, for originals (e.g. 4K HEVC) the browser can't play.
export const proxyDir = resolve(repoRoot, "media/proxies");

// A proxy's file name is the original file name with only the extension unified to .mp4.
export function proxyFileName(originalName: string): string {
  return `${basename(originalName, extname(originalName))}.mp4`;
}

export interface ProxyQueueState {
  /** Original clip file names that haven't started processing yet (in wait order). */
  pending: string[];
  /** Original clip file name currently being turned into a proxy, or null if none. */
  generating: string | null;
}

// State of the proxy generation queue — exposed via GET /api/proxy-status so the edit screen can
// show a "generating proxies" notice.
let proxyQueueState: ProxyQueueState = { pending: [], generating: null };

export function getProxyQueueState(): ProxyQueueState {
  return proxyQueueState;
}

/**
 * For local video files that physically exist in clipDir, generates a 720p H.264 preview proxy
 * sequentially (one at a time) if it's missing or older than the original.
 * Run in the background without awaiting at the call site, so it doesn't block server startup.
 */
export async function generateProxies(clipDir: string, log: (msg: string) => void): Promise<void> {
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
