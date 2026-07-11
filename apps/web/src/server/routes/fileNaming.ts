import { resolve } from "node:path";

/** Replaces filesystem-unsafe characters so a project name is always a valid single file name, on any platform. */
export function sanitizeFileName(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 0 ? cleaned : "export";
}

/** Formats source seconds as "m.ss" (minutes, dot, zero-padded seconds) for a frame-capture file name, e.g. 125.3 -> "2.05". */
export function formatMinSec(atS: number): string {
  const totalSeconds = Math.floor(atS);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}.${String(seconds).padStart(2, "0")}`;
}

/**
 * Builds a render output path inside outputDir for projectName, timestamped so repeated renders of
 * the same project never overwrite each other (issue #4) - GET /out.mp4 stays a stable alias for
 * the last completed render regardless of project name.
 */
export function renderOutputPathFor(outputDir: string, projectName: string): string {
  const stamp = new Date()
    .toISOString()
    .slice(0, 16)
    .replace("T", " ")
    .replace(":", ".");
  return resolve(outputDir, `${sanitizeFileName(projectName)} ${stamp}.mp4`);
}
