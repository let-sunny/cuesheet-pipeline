import type { CueSheet } from "@cuesheet/schema";

/**
 * Walks the segments in order and converts the output-timeline time ((out-in)/speed,
 * cumulative) into SRT. Cuts with an empty subtitle are skipped, and indices are
 * renumbered consecutively using only the remaining cues.
 * intro/outro are excluded from this accumulation under the same v1 constraint as the
 * narration offset (see render/plan.ts — intro duration can't be known without probing the file).
 *
 * This lives in the render package because it's logic that consumes a cuesheet to produce
 * an output artifact (SRT) — both web's (cuesheet-plugin.ts) /api/subtitles.srt route and
 * the CLI (--srt) use this function as-is.
 */
export function buildSrt(cue: CueSheet): string {
  let cursor = 0;
  let index = 1;
  const blocks: string[] = [];
  for (const seg of cue.segments) {
    const start = cursor;
    const end = cursor + (seg.out - seg.in) / seg.speed;
    cursor = end;
    const text = seg.subtitle.trim();
    if (text === "") {
      continue;
    }
    blocks.push(`${index}\n${secondsToSrtTimestamp(start)} --> ${secondsToSrtTimestamp(end)}\n${text}\n`);
    index += 1;
  }
  return blocks.join("\n");
}

/** Formats a time in seconds as an SRT timestamp (HH:MM:SS,mmm). */
export function secondsToSrtTimestamp(totalSeconds: number): string {
  const ms = Math.max(0, Math.round(totalSeconds * 1000));
  const hh = Math.floor(ms / 3600000);
  const mm = Math.floor((ms % 3600000) / 60000);
  const ss = Math.floor((ms % 60000) / 1000);
  const mmm = ms % 1000;
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return `${pad(hh)}:${pad(mm)}:${pad(ss)},${pad(mmm, 3)}`;
}
