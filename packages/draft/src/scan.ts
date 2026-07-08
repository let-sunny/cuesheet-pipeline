import { execFile } from "node:child_process";
import { mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

/**
 * scan stage: inventories the raw source folder + extracts frames for vision judgment.
 * The output (manifest.json) is what Claude looks at directly to produce moments.json.
 */

const execFileAsync = promisify(execFile);

const VIDEO_EXT = /\.(mp4|mov)$/i;
const FFPROBE_TIMEOUT_MS = 15_000;
const FFMPEG_TIMEOUT_MS = 15_000;

export interface FrameRef {
  t: number;
  path: string;
}

export interface ClipManifest {
  name: string;
  durS: number;
  interval: number;
  frames: FrameRef[];
}

export interface Manifest {
  clips: ClipManifest[];
  evicted: string[];
}

/** Frame-extraction interval (seconds) based on clip length (seconds). Longer clips get sparser sampling. */
export function intervalFor(durS: number): number {
  if (durS < 15) return 2;
  if (durS < 60) return 5;
  if (durS < 300) return 15;
  return 60;
}

/**
 * Whether the file is an iCloud not-downloaded (placeholder) file. blocks===0 means there's
 * no local copy yet, so reading it would hang indefinitely waiting for the download —
 * always check this first and skip.
 */
function isEvicted(path: string): boolean {
  return statSync(path).blocks === 0;
}

async function probeDuration(path: string): Promise<number> {
  const { stdout } = await execFileAsync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", path],
    { timeout: FFPROBE_TIMEOUT_MS },
  );
  return Number.parseFloat(stdout.trim());
}

/** List of timestamps at `interval` spacing starting from t=0, with the last one adjusted to 1 second before the clip ends. */
function timestampsFor(durS: number, interval: number): number[] {
  const ts: number[] = [];
  for (let t = 0; t < durS - 1; t += interval) ts.push(t);
  const last = Math.max(0, durS - 1);
  const lastPushed = ts[ts.length - 1];
  if (lastPushed === undefined || last - lastPushed > 0.5) ts.push(last);
  return ts;
}

/** Extracts a single 640px frame via ffmpeg seek-based (-ss before -i). Returns null on failure or an empty file. */
async function extractFrame(clipPath: string, t: number, outDir: string): Promise<string | null> {
  const filename = `t${String(Math.round(t)).padStart(5, "0")}.jpg`;
  const outPath = join(outDir, filename);
  try {
    await execFileAsync(
      "ffmpeg",
      ["-y", "-ss", String(t), "-i", clipPath, "-frames:v", "1", "-vf", "scale=640:-2", outPath],
      { timeout: FFMPEG_TIMEOUT_MS },
    );
  } catch {
    return null;
  }
  try {
    if (statSync(outPath).size === 0) return null;
  } catch {
    return null;
  }
  return outPath;
}

/**
 * Scans the raw source folder: skips iCloud not-downloaded clips, and for local clips
 * only, probes duration with ffprobe and then extracts frames at a length-based interval.
 */
export async function scanFolder(srcDir: string, workDir: string): Promise<Manifest> {
  const names = readdirSync(srcDir)
    .filter((n) => VIDEO_EXT.test(n))
    .sort((a, b) => a.localeCompare(b));

  const evicted: string[] = [];
  const clips: ClipManifest[] = [];
  const framesRoot = join(workDir, "frames");

  for (const name of names) {
    const path = join(srcDir, name);
    if (isEvicted(path)) {
      evicted.push(name);
      continue;
    }

    const durS = await probeDuration(path);
    const interval = intervalFor(durS);
    const clipFramesDir = join(framesRoot, name.replace(VIDEO_EXT, ""));
    mkdirSync(clipFramesDir, { recursive: true });

    const frames: FrameRef[] = [];
    for (const t of timestampsFor(durS, interval)) {
      const framePath = await extractFrame(path, t, clipFramesDir);
      if (framePath) frames.push({ t, path: framePath });
    }

    clips.push({ name, durS, interval, frames });
  }

  return { clips, evicted };
}
