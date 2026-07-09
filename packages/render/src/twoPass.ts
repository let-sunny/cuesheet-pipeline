import { join } from "node:path";
import type { CueSheet } from "@cuesheet/schema";
import { computeSegmentOutputTimings } from "./timeline.js";
import type { TitleAsset } from "./title.js";

/** A single ffmpeg invocation within a (possibly multi-pass) render plan. */
export interface RenderCommand {
  /** Full argument list to follow "ffmpeg" */
  args: string[];
  /** -filter_complex graph (for debugging/verification) */
  filterComplex: string;
  outputPath: string;
  /** Human-readable pass name (e.g. "single-pass", "pass1-base", "pass2-titles"). */
  label: string;
}

/**
 * Builds pass 2 of a two-pass title render: a single-input (the pass-1 intermediate) ffmpeg
 * invocation that chains one `overlay` per captured-frames title, each gated to its own absolute
 * OUTPUT-timeline window instead of the segment-local [0, title.durationS] window the single-pass
 * per-clip chain uses (see plan.ts's addClip) - the intermediate is already the fully concatenated/
 * mixed base cut, so there is no more per-clip local timeline to anchor to.
 *
 * Why this avoids the deadlock: the single-pass graph feeds N HEVC decode branches AND M title-PNG-
 * sequence branches into the same filter_complex, all active near-simultaneously ahead of `concat`.
 * Pass 2 has exactly ONE real video decode (the intermediate) plus each title's PNG-sequence input,
 * chained sequentially (one overlay's output IS the next overlay's input) - there is no concat node
 * and no more than two active branches converging at any single filter, structurally the same shape
 * as the demo's already-working "solo title" render (see docs/STATUS.md), just repeated per title.
 *
 * Each title's own PNG-sequence input is time-shifted via `setpts=PTS+<offsetS>/TB` before its
 * overlay - the standard ffmpeg idiom for placing a secondary overlay input at a nonzero output
 * time (mirrors adelay's role for audio elsewhere in this package). Without the shift, the title's
 * own frames would still be presented at its local pts [0, durationS] while the `enable` gate only
 * turns on once the main timeline reaches the segment's real (later) offset - by then the title
 * input would already be past EOF and frozen on its last frame instead of animating.
 *
 * title.backdrop's dim layer (if present) gets the exact same shift-then-chain treatment as the
 * title itself - see plan.ts's addClip for the un-shifted (segment-local) version of this same
 * filter shape; kept as a separate implementation here rather than shared since the two operate in
 * structurally different contexts (one clip-local filter vs. one link in a whole-timeline chain).
 */
export function buildTitleOverlayPass(
  cue: CueSheet,
  intermediatePath: string,
  outputPath: string,
  frameTitleIndices: number[],
  titleAssets: Record<number, TitleAsset>,
): RenderCommand {
  const { width: W, height: H, fps } = cue.project;
  const timings = computeSegmentOutputTimings(cue);
  const inputs: string[] = ["-i", intermediatePath];
  const filters: string[] = [];
  let vLabel = "0:v";
  let nextInputIdx = 1;

  for (const i of frameTitleIndices) {
    const segment = cue.segments[i];
    const title = segment?.title;
    const asset = titleAssets[i];
    const timing = timings[i];
    if (!title || !asset || asset.kind !== "frames" || !timing) continue;

    const offset = timing.startS;
    const durationS = title.durationS;
    const windowEnd = offset + durationS;
    const enable = `enable='between(t,${offset},${windowEnd})'`;

    if (title.backdrop) {
      const dim = title.backdrop.dim;
      const fadeT = Math.min(durationS / 2, 0.4);
      const fadeOutStart = Math.max(0, durationS - fadeT);
      const dimLabel = `dim${i}`;
      filters.push(
        `color=black:size=${W}x${H}:duration=${durationS}:rate=${fps},format=yuva420p,` +
          `fade=t=in:st=0:d=${fadeT}:alpha=1,fade=t=out:st=${fadeOutStart}:d=${fadeT}:alpha=1,` +
          `colorchannelmixer=aa=${dim},setpts=PTS+${offset}/TB[${dimLabel}]`,
      );
      const dimmedLabel = `vdim${i}`;
      filters.push(`[${vLabel}][${dimLabel}]overlay=0:0:${enable}[${dimmedLabel}]`);
      vLabel = dimmedLabel;
    }

    inputs.push("-framerate", String(asset.fps), "-i", join(asset.dir, "frame_%04d.png"));
    const titleInputIdx = nextInputIdx++;
    const shiftedLabel = `vtitleshift${i}`;
    filters.push(`[${titleInputIdx}:v]setpts=PTS+${offset}/TB[${shiftedLabel}]`);
    const overlaidLabel = `vtitle${i}`;
    filters.push(`[${vLabel}][${shiftedLabel}]overlay=0:0:format=auto:${enable}[${overlaidLabel}]`);
    vLabel = overlaidLabel;
  }

  const filterComplex = filters.join(";");
  const args = [
    ...inputs,
    "-filter_complex",
    filterComplex,
    "-map",
    `[${vLabel}]`,
    "-map",
    "0:a",
    "-r",
    String(fps),
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "copy",
    "-y",
    outputPath,
  ];
  return { args, filterComplex, outputPath, label: "pass2-titles" };
}

/**
 * Decides whether a cuesheet needs a two-pass render (see buildTitleOverlayPass's doc for the
 * "why"). True iff at least one segment wires in a captured-frames title (frameTitleIndices
 * non-empty) AND the base concat graph's input count is at/above TWO_PASS_INPUT_THRESHOLD.
 */
export function needsTwoPassRender(cue: CueSheet, frameTitleIndices: number[]): boolean {
  if (frameTitleIndices.length === 0) return false;
  return totalConcatInputCount(cue) >= TWO_PASS_INPUT_THRESHOLD;
}

/**
 * Segment indices whose title resolves to a captured-frames asset (gooey/melt/particle) rather
 * than an ASS file (typing) - only the frames kind is implicated in the concat+overlay deadlock
 * (see needsTwoPassRender), since only it wires in an extra image2-sequence ffmpeg input feeding
 * an `overlay` branch ahead of `concat`. A "typing" (ASS) title stays in pass 1 unconditionally -
 * it composites via the `subtitles=` filter (reads its own file off disk, no extra ffmpeg input,
 * no overlay branch), which was never implicated.
 */
export function frameTitleSegmentIndices(
  cue: CueSheet,
  titleAssets: Record<number, TitleAsset> | undefined,
): number[] {
  const indices: number[] = [];
  cue.segments.forEach((s, i) => {
    if (s.title && titleAssets?.[i]?.kind === "frames") indices.push(i);
  });
  return indices;
}

/**
 * Total ffmpeg-input count a cuesheet's concat graph would use (segments + intro + outro) - the
 * dimension the deadlock (see needsTwoPassRender's doc) scales with. Doesn't count title PNG-
 * sequence inputs, BGM, or narration - the deadlock was isolated to the base concat's own input
 * count combined with a captured-frames title overlay branch (see docs/STATUS.md's 2-pass entry).
 */
export function totalConcatInputCount(cue: CueSheet): number {
  return cue.segments.length + (cue.intro ? 1 : 0) + (cue.outro ? 1 : 0);
}

/**
 * Pass 1's intermediate file path: colocated next to the final output, suffixed before the
 * extension (out.mp4 -> out.pass1-intermediate.mp4) so it's easy to find for debugging. Not
 * cleaned up automatically (same precedent as media/title-cache/) - see docs/STATUS.md's 2-pass
 * entry for the disk-space tradeoff this implies (a near-lossless intermediate can be much larger
 * than the final delivery encode).
 */
export function deriveIntermediatePath(outputPath: string): string {
  const lastDot = outputPath.lastIndexOf(".");
  const lastSlash = outputPath.lastIndexOf("/");
  if (lastDot <= lastSlash) return `${outputPath}.pass1-intermediate.mp4`;
  return `${outputPath.slice(0, lastDot)}.pass1-intermediate${outputPath.slice(lastDot)}`;
}

/**
 * Threshold provenance: NOT bisected against a live repro in this environment (see the task's
 * repro notes) - an extensive repro attempt (12-100 synthetic HEVC clips, 720p-4K, 1-8 captured-
 * frames titles with/without backdrop dim, with the existing `-filter_complex_threads 1`
 * mitigation both present and stripped) never reproduced a hang on this machine's ffmpeg build
 * (8.1.2). The demo bisection that originally found the deadlock (see docs/STATUS.md) used real
 * 4K HEVC raw footage, not available in this repo (evicted to iCloud / never committed) - the
 * deadlock is very plausibly sensitive to real footage's decode-timing variance in a way flat
 * synthetic testsrc/mandelbrot clips aren't. Given that, this threshold is set directly from the
 * task's given empirical fact ("fewer inputs or no titles -> fine", "10+ HEVC clips" deadlocks)
 * rather than invented - follow up with a real-footage validation run if the deadlock resurfaces
 * at a different count.
 */
export const TWO_PASS_INPUT_THRESHOLD = 10;

/**
 * Pass 1's intermediate video encode settings - visually lossless-or-near rather than the final
 * delivery encode, since pass 2 re-encodes this output's video a second time (composited with
 * title overlays) and a lossy intermediate would compound generation loss. crf=10 (x264) is far
 * below the usual "visually lossless" cutoff (~18), at the cost of a much larger intermediate
 * file (roughly 5-10x a normal delivery encode for the same content) - acceptable since it's a
 * temporary, non-delivered artifact. `-preset veryfast` trades a little compression efficiency
 * (bigger file, not worse quality) for faster pass-1 encode time.
 */
export const INTERMEDIATE_VIDEO_ENCODE_ARGS = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "10"];
