import { rename } from "node:fs/promises";
import { resolve } from "node:path";
import { repoRoot, runFfmpeg } from "../shared.js";

// Disk cache for segment thumbnails (seek-extraction results, used by the edit step's cut list/mini timeline).
export const thumbsDir = resolve(repoRoot, "media/.thumbs");

/** Dedups by key (clipStem_roundedTime_width), generating only if not already cached. */
export async function getOrGenerateThumb(
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
