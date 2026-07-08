import type { ClipMoments } from "./api.js";

/** Extracts just the file name in the browser without node:path (handles both path separators). */
export function baseName(path: string): string {
  const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return idx === -1 ? path : path.slice(idx + 1);
}

/** File name with the extension stripped — used to match against frame folder names. */
export function stem(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  return idx === -1 ? fileName : fileName.slice(0, idx);
}

/** clipDir + clip file name -> the path stored in the intro/outro fields (per the schema comment, this is
 * an independent path unrelated to clipDir, but when assigning from the palette/inspector we compose it to
 * point at the original file under clipDir). */
export function buildClipPath(clipDir: string, clipFileName: string): string {
  return `${clipDir.replace(/\/+$/, "")}/${clipFileName}`;
}

/**
 * Approximate duration per clip (seconds). Instead of measuring the actual file length via ffprobe, this
 * uses the latest timestamp recorded in the rough-cut highlight data (moments/monotonousRanges) as a lower
 * bound on duration — the assumption (stated explicitly) is that if there's an untagged tail, this can come
 * out shorter than the real length. This is far cheaper than an extra ffprobe call or a separate duration
 * cache route, and carries no risk of hanging on an iCloud placeholder clip (blocks===0).
 */
export function computeClipDurations(entries: ClipMoments[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const entry of entries) {
    const name = baseName(entry.clip);
    let max = 0;
    for (const m of entry.moments) {
      max = Math.max(max, m.outS);
    }
    for (const r of entry.monotonousRanges) {
      max = Math.max(max, r.endS);
    }
    map[name] = Math.max(map[name] ?? 0, max);
  }
  return map;
}

/** Intro/outro are whole clips that can't have an in/out range set, so clips longer than this are blocked from being assigned. */
export const INTRO_OUTRO_MAX_DURATION_S = 15;
