import type { CueSheet } from "@cuesheet/schema";

/**
 * ffmpeg fatal-error line patterns, checked from the end of stderr backwards - ffmpeg has no
 * single consistent "the error is on this line" convention, so this is a best-effort summary for
 * the toast/banner (previously the raw ~2000-char stderr dump was shown in both the toast AND the
 * persistent banner at once, which read as duplicated wall-of-text). Falls back to the last
 * non-empty line if nothing matches; the full dump stays available in the collapsible detail for
 * whatever this heuristic misses.
 */
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

// Parses "time=HH:MM:SS.ms" out of an ffmpeg stderr line, in seconds.
export function parseFfmpegTimeSeconds(text: string): number | null {
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
export function estimateOutputSeconds(cue: CueSheet): number {
  return cue.segments.reduce((sum, s) => sum + (s.out - s.in) / s.speed, 0);
}

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
