import { join } from "node:path";
import type { CueSheet, Segment } from "@cuesheet/schema";
import { buildDuckingGainExpression, deriveDuckingWindows } from "./ducking.js";
import { computeSegmentOutputTimings } from "./timeline.js";
import type { TitleAsset } from "./title.js";
import {
  buildTitleOverlayPass,
  deriveIntermediatePath,
  frameTitleSegmentIndices,
  INTERMEDIATE_VIDEO_ENCODE_ARGS,
  needsTwoPassRender,
  type RenderCommand,
} from "./twoPass.js";

export { buildDuckingGainExpression, deriveDuckingWindows, mergeDuckingWindows } from "./ducking.js";
export type { DuckingWindow } from "./ducking.js";

export { buildSrt, secondsToSrtTimestamp } from "./srt.js";
export { DEFAULT_TITLE_CACHE_DIR, prepareTitleAssets, titleCacheKey } from "./title.js";
export type { TitleAsset, TitleFramesAsset } from "./title.js";

export { computeSegmentOutputTimings } from "./timeline.js";
export type { SegmentOutputTiming } from "./timeline.js";

export {
  deriveIntermediatePath,
  frameTitleSegmentIndices,
  needsTwoPassRender,
  totalConcatInputCount,
  TWO_PASS_INPUT_THRESHOLD,
} from "./twoPass.js";
export type { RenderCommand } from "./twoPass.js";

export interface RenderPlan {
  /**
   * Full argument list to follow "ffmpeg" - for a two-pass render (see `commands`), this is the
   * FINAL pass's args (pass 2, titles-onto-intermediate), not pass 1's. A caller that only reads
   * `args` (rather than checking `commands`) and runs it directly will get a fast, clear ffmpeg
   * error (missing intermediate input file) instead of silently producing a video with no titles -
   * see docs/STATUS.md's 2-pass entry for why that tradeoff was chosen, and the follow-up this
   * implies for any caller that needs correct two-pass output (must run every entry in `commands`
   * in order instead).
   */
  args: string[];
  /** -filter_complex graph for `args` above (for debugging/verification) */
  filterComplex: string;
  outputPath: string;
  /**
   * Every ffmpeg invocation needed to produce `outputPath`, in order. Single-pass cuesheets (the
   * overwhelming majority) get exactly one entry, identical to { args, filterComplex, outputPath }
   * above. A cuesheet that trips needsTwoPassRender (captured-frames title + a large HEVC concat -
   * see twoPass.ts) gets two: pass 1 renders the base cut (concat/trim/speed/subtitles/audio) to an
   * intermediate file, pass 2 overlays the title(s) onto that single-input intermediate. Added
   * additively (2026-07-10) - existing callers reading only `args`/`filterComplex`/`outputPath`
   * keep compiling and keep working for every cuesheet below the two-pass threshold.
   */
  commands: RenderCommand[];
  /**
   * Non-fatal warnings collected while building the plan (e.g. a subtitle likely to overflow the
   * frame at render). Callers (the CLI, the web server) are responsible for surfacing these -
   * this stays a plain data field so buildRenderPlan itself has no I/O/logging side effects.
   */
  warnings: string[];
}

export interface SourceDimensions {
  width: number;
  height: number;
}

export interface RenderPlanOptions {
  /** Burns subtitles into the video via drawtext. Defaults to true (existing behavior).
   * If false, produces a clean video meant to be combined with a CC/SRT track — drawtext is omitted. */
  burnSubtitles?: boolean;
  /**
   * Actual source dimensions (from ffprobe), keyed by clip filename (segment.clip) — only
   * needed for clips that have a crop. buildRenderPlan stays pure (no ffprobe itself); the
   * CLI probes each cropped clip and passes the result here. Clips without an entry (or when
   * this whole option is omitted) skip the check below — the schema-level check
   * (@cuesheet/schema's w===h invariant) already covers the same-aspect-source assumption;
   * this is the precise check against the clip's *actual* dimensions, catching sources that
   * don't actually share the project's aspect ratio.
   */
  sourceDimensions?: Record<string, SourceDimensions>;
  /**
   * Prepared title-card assets (Remotion-captured, transparent PNG-sequence directories), keyed by
   * segment index - see title.ts's prepareTitleAssets. buildRenderPlan itself stays pure/sync (no
   * ffprobe, no Remotion/browser calls); the CLI/web server call prepareTitleAssets first and pass
   * the result here. A segment with a `title` but no matching entry here throws a fieldpath-style
   * error (segments[i].title: ...) rather than silently skipping the title.
   */
  titleAssets?: Record<number, TitleAsset>;
  /**
   * Each narrated segment's own audio clip duration (seconds), keyed by segment index - only
   * needed when cue.narration.ducking is set (PRD backlog #4). buildRenderPlan stays pure/sync
   * (no ffprobe itself); the CLI/web server probe each segment.narration file and pass the
   * result here, same pattern as sourceDimensions above. A narrated segment missing an entry
   * here just skips ducking for that one cut (see ducking.ts's deriveDuckingWindows) rather than
   * throwing - unlike a missing titleAssets entry, ducking is a non-essential enhancement on top
   * of narration, not something narration itself depends on to render.
   */
  narrationDurations?: Record<number, number>;
}

/**
 * Converts a cuesheet into an ffmpeg render plan (one or more ffmpeg invocations - see
 * RenderPlan.commands). Each segment is trimmed -> sped up -> scaled -> fps-normalized ->
 * subtitled (if any), then joined via concat; if bgm is present, its start time (adelay) and
 * volume are applied and mixed in with amix.
 *
 * Units are seconds. Clip paths are assembled from clipDir + filename (so moving the folder
 * doesn't break things).
 *
 * Two-pass dispatch: a cuesheet with a captured-frames title (any preset - all four render via
 * Remotion now) combined with a large HEVC concat graph (needsTwoPassRender - see twoPass.ts)
 * deadlocks ffmpeg's filter-graph scheduler in a single pass. Below that threshold (the
 * overwhelming majority of cuesheets), behavior is unchanged from before this existed: one
 * command, byte-identical args/filterComplex.
 * At/above it, this builds two commands instead (pass 1: base cut -> intermediate file; pass 2:
 * title overlays -> final output) - see RenderPlan.commands's doc for the API-compatibility note.
 */
export function buildRenderPlan(cue: CueSheet, outputPath: string, opts?: RenderPlanOptions): RenderPlan {
  const frameTitleIndices = frameTitleSegmentIndices(cue, opts?.titleAssets);

  if (!needsTwoPassRender(cue, frameTitleIndices)) {
    const { command, warnings } = buildBasePassCommand(cue, outputPath, opts, {
      deferFrameTitleIndices: EMPTY_DEFER_SET,
      label: "single-pass",
    });
    return { args: command.args, filterComplex: command.filterComplex, outputPath: command.outputPath, commands: [command], warnings };
  }

  const intermediatePath = deriveIntermediatePath(outputPath);
  const { command: pass1, warnings } = buildBasePassCommand(cue, intermediatePath, opts, {
    deferFrameTitleIndices: new Set(frameTitleIndices),
    videoEncodeArgs: INTERMEDIATE_VIDEO_ENCODE_ARGS,
    label: "pass1-base",
  });
  // titleAssets is guaranteed populated for every index in frameTitleIndices (that's exactly how
  // frameTitleSegmentIndices derives them), so this is never undefined here.
  const pass2 = buildTitleOverlayPass(cue, intermediatePath, outputPath, frameTitleIndices, opts?.titleAssets ?? {});

  return {
    args: pass2.args,
    filterComplex: pass2.filterComplex,
    outputPath: pass2.outputPath,
    commands: [pass1, pass2],
    warnings,
  };
}

/** No segment indices deferred - the single-pass control value, named for readability at call sites. */
const EMPTY_DEFER_SET: ReadonlySet<number> = new Set();

interface BasePassControl {
  /**
   * Segment indices whose title/backdrop rendering is skipped in THIS pass (deferred to pass 2's
   * buildTitleOverlayPass instead). Every titled segment is frame-kind now (see
   * frameTitleSegmentIndices's doc), so this can be any subset of them - for pass 1 of a two-pass
   * render, it's every frame-titled segment (none render in pass 1 at all).
   */
  deferFrameTitleIndices: ReadonlySet<number>;
  /** Overrides the trailing `-c:v ...` encode args (default: today's single-pass delivery encode). */
  videoEncodeArgs?: string[];
  label: string;
}

/**
 * Builds the base concat/mix filter graph (everything buildRenderPlan has always done) as one
 * RenderCommand. Extracted out of buildRenderPlan so both the single-pass path and two-pass
 * render's pass 1 share this one implementation - see buildRenderPlan's dispatch above and
 * BasePassControl's doc for what varies between the two.
 */
function buildBasePassCommand(
  cue: CueSheet,
  outputPath: string,
  opts: RenderPlanOptions | undefined,
  control: BasePassControl,
): { command: RenderCommand; warnings: string[] } {
  const burnSubtitles = opts?.burnSubtitles ?? true;
  assertCropMatchesProjectAspect(cue, opts?.sourceDimensions);
  const { width: W, height: H, fps } = cue.project;
  const inputs: string[] = [];
  const filters: string[] = [];
  // The concat filter requires per-segment [v][a] pairs to alternate: [v0][a0][v1][a1]...
  const concatLabels: string[] = [];
  const warnings: string[] = [];
  let clipCount = 0;
  let idx = 0;
  // Set when any segment wires in a captured-frames title (any preset - all four render via
  // Remotion now) - see the -filter_complex_threads note near the end of this function for why.
  let usesFrameOverlayTitle = false;

  function addClip(
    path: string,
    o: {
      ss?: number;
      dur?: number;
      speed?: number;
      volume?: number;
      subtitle?: string;
      crop?: CueSheet["segments"][number]["crop"];
      /** Already-merged style (global < preset < per-cut override) - see resolveSubtitleStyle. */
      resolvedStyle?: CueSheet["subtitleStyle"];
      title?: CueSheet["segments"][number]["title"];
      titleAsset?: TitleAsset;
      /** True when this segment's title is deferred to a two-pass render's pass 2 (see BasePassControl). */
      deferTitle?: boolean;
      transitionIn?: CueSheet["segments"][number]["transitionIn"];
      transitionOut?: CueSheet["segments"][number]["transitionOut"];
      /** This clip's own OUTPUT duration (seconds, post-speed) - only needed when a transition is
       * present, to compute its segment-local offsets (see applyTransition). intro/outro never
       * pass this (their duration isn't known without probing the file), which is fine since they
       * never carry a transitionIn/Out either. */
      outputDurationS?: number;
    },
  ): void {
    if (o.ss != null) inputs.push("-ss", String(o.ss));
    if (o.dur != null) inputs.push("-t", String(o.dur));
    inputs.push("-i", path);
    const i = idx++;
    const speed = o.speed ?? 1;
    const vol = o.volume ?? 1;

    const vParts = ["setpts=PTS-STARTPTS"];
    if (speed !== 1) vParts.push(`setpts=PTS/${speed}`);
    if (o.crop) {
      const { x, y, w, h } = o.crop;
      vParts.push(`crop=w=iw*${w}:h=ih*${h}:x=iw*${x}:y=ih*${y}`);
    }
    // crop can change the aspect ratio, but the following scale=W:H always stretches
    // to fill W:H without preserving the original aspect ratio (same behavior for
    // segments without crop) — no separate letterbox/pad is needed.
    // setsar=1: scaling after crop can leave the SAR not 1:1 (e.g. 4:3), but concat
    // requires SAR to match across all segments, so this forces it uniform (confirmed
    // in an actual render mixing cropped and regular cuts).
    vParts.push(`scale=${W}:${H}`, `setsar=1`, `fps=${fps}`);
    if (burnSubtitles && o.subtitle && o.subtitle.length > 0 && o.resolvedStyle) {
      vParts.push(drawtextFilter(o.subtitle, o.resolvedStyle));
    }
    // The base per-clip chain (trim/speed/crop/scale/fps/subtitle) always finishes on label
    // v${i} when there's no title, keeping every existing filter string byte-identical to
    // before (regression safety) - vLabel only diverges when a title/backdrop stage below
    // appends further links to the chain.
    let vLabel = `v${i}`;
    filters.push(`[${i}:v]${vParts.join(",")}[${vLabel}]`);

    if (o.title && o.titleAsset && !o.deferTitle) {
      const durationS = o.title.durationS;
      // Backdrop dim: a black color-source layer, faded in/out via `fade ... alpha=1` (ramps the
      // *alpha* channel 0->1->0 instead of the usual luma-to-black) and capped at the requested
      // peak via colorchannelmixer=aa=<dim>, then alpha-composited over the base video. Title
      // always starts at the segment's own local t=0 (no separate `start` field in the schema).
      if (o.title.backdrop) {
        const dim = o.title.backdrop.dim;
        const fadeT = Math.min(durationS / 2, 0.4);
        const fadeOutStart = Math.max(0, durationS - fadeT);
        filters.push(
          `color=black:size=${W}x${H}:duration=${durationS}:rate=${fps},format=yuva420p,` +
            `fade=t=in:st=0:d=${fadeT}:alpha=1,fade=t=out:st=${fadeOutStart}:d=${fadeT}:alpha=1,` +
            `colorchannelmixer=aa=${dim}[dim${i}]`,
        );
        const dimmedLabel = `vdim${i}`;
        filters.push(`[${vLabel}][dim${i}]overlay=0:0:enable='between(t,0,${durationS})'[${dimmedLabel}]`);
        vLabel = dimmedLabel;
      }

      usesFrameOverlayTitle = true;
      inputs.push("-framerate", String(o.titleAsset.fps), "-i", join(o.titleAsset.dir, "frame_%04d.png"));
      const titleInputIdx = idx++;
      const titleLabel = `vtitle${i}`;
      filters.push(
        `[${vLabel}][${titleInputIdx}:v]overlay=0:0:format=auto:enable='between(t,0,${durationS})'[${titleLabel}]`,
      );
      vLabel = titleLabel;
    }

    // Per-cut fade/dip (PRD backlog #3) - applied last in the video chain (after title/backdrop),
    // since a transition fades the whole composited frame the viewer actually sees, not just the
    // base footage. Offsets are computed on this clip's own OUTPUT duration (o.outputDurationS,
    // already post-speed - see the caller) since every upstream stage (setpts=PTS/speed) has
    // already rebased the timeline to output time by this point in the chain.
    let clampedTransitionDurations: { dIn: number; dOut: number } | null = null;
    if (o.outputDurationS != null && (o.transitionIn || o.transitionOut)) {
      clampedTransitionDurations = clampTransitionDurations(o.transitionIn, o.transitionOut, o.outputDurationS);
      const { dIn, dOut } = clampedTransitionDurations;
      if (o.transitionIn) {
        vLabel = applyTransition(filters, vLabel, i, "in", o.transitionIn, dIn, o.outputDurationS, W, H, fps);
      }
      if (o.transitionOut) {
        vLabel = applyTransition(filters, vLabel, i, "out", o.transitionOut, dOut, o.outputDurationS, W, H, fps);
      }
    }

    const aParts = ["asetpts=PTS-STARTPTS"];
    if (speed !== 1) aParts.push(...atempoChain(speed));
    if (vol !== 1) aParts.push(`volume=${vol}`);
    if (o.outputDurationS != null) {
      const { dIn, dOut } =
        clampedTransitionDurations ?? clampTransitionDurations(o.transitionIn, o.transitionOut, o.outputDurationS);
      aParts.push(...transitionAudioFilters(o.transitionIn, o.transitionOut, dIn, dOut, o.outputDurationS));
    }
    filters.push(`[${i}:a]${aParts.join(",")}[a${i}]`);

    concatLabels.push(`[${vLabel}]`, `[a${i}]`);
    clipCount++;
  }

  if (cue.intro) addClip(cue.intro, {});
  // Cumulative output-timeline start time per segment (speed-adjusted) — used to place narration
  // audio at that time (same offset math a two-pass render's pass 2 uses to place title overlays -
  // see timeline.ts's doc for the v1 intro-duration constraint this inherits).
  const segmentTimings = computeSegmentOutputTimings(cue);
  const narrationCues: { path: string; start: number }[] = [];
  cue.segments.forEach((s, i) => {
    const style = resolveSubtitleStyle(cue, s);
    if (burnSubtitles && s.subtitle.length > 0) {
      const overflow = subtitleOverflowWarning(s.subtitle, style.size, W);
      if (overflow) {
        warnings.push(`segments[${i}].subtitle: ${overflow}`);
      }
    }
    if (s.title) {
      const asset = opts?.titleAssets?.[i];
      if (!asset) {
        throw new Error(
          `segments[${i}].title: no prepared asset for this cut - call prepareTitleAssets before ` +
            `buildRenderPlan and pass its result as opts.titleAssets`,
        );
      }
    }
    addClip(join(cue.clipDir, s.clip), {
      ss: s.in,
      dur: s.out - s.in,
      speed: s.speed,
      volume: s.volume,
      subtitle: s.subtitle,
      crop: s.crop,
      resolvedStyle: style,
      title: s.title ?? undefined,
      titleAsset: s.title ? opts?.titleAssets?.[i] : undefined,
      deferTitle: control.deferFrameTitleIndices.has(i),
      transitionIn: s.transitionIn ?? undefined,
      transitionOut: s.transitionOut ?? undefined,
      outputDurationS: (s.out - s.in) / s.speed,
    });
    if (cue.narration?.enabled && s.narration) {
      narrationCues.push({ path: join(cue.narration.dir, s.narration), start: segmentTimings[i]!.startS });
    }
  });
  if (cue.outro) addClip(cue.outro, {});

  const n = clipCount;
  filters.push(`${concatLabels.join("")}concat=n=${n}:v=1:a=1[vout][amain]`);

  // BGM ducking (PRD backlog #4) - windows are derived once, up front, from narration placements
  // (independent of the addClip loop above; see ducking.ts's deriveDuckingWindows doc - both it and
  // this function's narrationCues placement above share the same computeSegmentOutputTimings, so
  // they can never drift apart). A cuesheet without narration.ducking set gets duckExpr === null,
  // so every BGM cue below falls back to the exact
  // same `volume=${b.volume}` filter string as before this feature existed (byte-identical,
  // regression-safe passthrough).
  const ducking = cue.narration?.ducking;
  let duckExpr: string | null = null;
  if (ducking) {
    const { windows, warnings: duckingWarnings } = deriveDuckingWindows(cue, opts?.narrationDurations);
    warnings.push(...duckingWarnings);
    duckExpr = buildDuckingGainExpression(windows, ducking.amount, ducking.fadeS);
  }

  const mixLabels: string[] = [];
  if (cue.bgm.length > 0) {
    for (const b of cue.bgm) {
      inputs.push("-i", b.file);
      const i = idx++;
      const delay = Math.round(b.start * 1000);
      const dur = b.end - b.start;
      // Ducking multiplies into this BGM's own volume (the ffmpeg volume filter's t refers to
      // this stream's own timestamp, which adelay above already shifted into output time - the
      // same domain deriveDuckingWindows placed its windows in). eval=frame is required for the
      // expression to be re-evaluated every frame instead of once at filter init.
      const volumePart = duckExpr
        ? `volume=eval=frame:volume='${b.volume}*(${duckExpr})'`
        : `volume=${b.volume}`;
      filters.push(
        `[${i}:a]atrim=0:${dur},adelay=${delay}|${delay},${volumePart}[bgm${i}]`,
      );
      mixLabels.push(`[bgm${i}]`);
    }
  }
  if (narrationCues.length > 0 && cue.narration) {
    const narrationVolume = cue.narration.volume;
    for (const nCue of narrationCues) {
      inputs.push("-i", nCue.path);
      const i = idx++;
      const delay = Math.round(nCue.start * 1000);
      filters.push(`[${i}:a]adelay=${delay}|${delay},volume=${narrationVolume}[nar${i}]`);
      mixLabels.push(`[nar${i}]`);
    }
  }

  let finalAudio = "[amain]";
  if (mixLabels.length > 0) {
    filters.push(
      `[amain]${mixLabels.join("")}amix=inputs=${1 + mixLabels.length}:duration=first[aout]`,
    );
    finalAudio = "[aout]";
  }

  // Episode-level fade in/out (PRD backlog #3) - applied to the final concat output, after bgm/
  // narration mixing, so it covers the whole finished export (intro if present, or the first
  // segment otherwise; same at the end).
  let finalVideo = "[vout]";
  if (cue.project.fadeInS) {
    filters.push(`${finalVideo}fade=t=in:st=0:d=${cue.project.fadeInS}[vfadein]`);
    finalVideo = "[vfadein]";
    filters.push(`${finalAudio}afade=t=in:st=0:d=${cue.project.fadeInS}[afadein]`);
    finalAudio = "[afadein]";
  }
  if (cue.project.fadeOutS) {
    // The final output's total duration isn't known at plan-build time without probing intro/
    // outro (same v1 constraint noted at computeSegmentOutputTimings above), so rather than computing an
    // absolute start time for "fade out", this uses the standard reverse-fade-in-reverse idiom:
    // reversing the stream turns "fade out the last N seconds" into "fade in the first N seconds",
    // which needs no knowledge of the stream's total length at all.
    filters.push(`${finalVideo}reverse,fade=t=in:st=0:d=${cue.project.fadeOutS},reverse[vfadeout]`);
    finalVideo = "[vfadeout]";
    filters.push(`${finalAudio}areverse,afade=t=in:st=0:d=${cue.project.fadeOutS},areverse[afadeout]`);
    finalAudio = "[afadeout]";
  }

  const filterComplex = filters.join(";");
  // Multiple simultaneous captured-frames title overlays (any preset - all four render via
  // Remotion now) in one render -
  // each its own image2-sequence input feeding an `overlay` branch ahead of `concat` - deadlocks
  // ffmpeg's default multi-threaded filter graph scheduler (empirically confirmed 2026-07-09:
  // reproducible with 3+ such branches in one filter_complex, CPU usage flatlines mid-encode with
  // no forward progress). Forcing single-threaded filter execution serializes the graph and
  // reliably avoids it - filter execution isn't the render's bottleneck (encode is), so this
  // costs negligible wall-clock time. Scoped to only when it's actually needed (a captured-frames
  // title is present) so cuesheets without one (the overwhelming majority) are unaffected.
  // This pass's own frame-overlay titles only (deferred ones don't set usesFrameOverlayTitle,
  // since their branch never gets built in this pass - see the addClip title condition above) -
  // for a two-pass render's pass 1, every frame title is deferred, so this is always false there
  // and the flag is never needed (pass 2 has its own, structurally simpler, deadlock-avoidance
  // rationale - see twoPass.ts's buildTitleOverlayPass doc).
  const videoEncodeArgs = control.videoEncodeArgs ?? ["-c:v", "libx264"];
  const args = [
    ...inputs,
    ...(usesFrameOverlayTitle ? ["-filter_complex_threads", "1"] : []),
    "-filter_complex",
    filterComplex,
    "-map",
    finalVideo,
    "-map",
    finalAudio,
    "-r",
    String(fps),
    ...videoEncodeArgs,
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-y",
    outputPath,
  ];
  return { command: { args, filterComplex, outputPath, label: control.label }, warnings };
}

/**
 * Verifies that each cropped segment's actual pixel aspect ratio (crop.w*srcWidth /
 * crop.h*srcHeight) matches the project's aspect ratio (project.width/project.height) within
 * CROP_ASPECT_TOLERANCE — beyond that, render/plan.ts's crop -> scale=W:H (no letterboxing)
 * would stretch the image. Throws a field-path style error naming the offending cut; a no-op
 * for segments with no crop or no matching sourceDimensions entry.
 */
function assertCropMatchesProjectAspect(cue: CueSheet, sourceDimensions?: Record<string, SourceDimensions>): void {
  if (!sourceDimensions) return;
  const projectAspect = cue.project.width / cue.project.height;
  cue.segments.forEach((s, i) => {
    if (!s.crop) return;
    const dims = sourceDimensions[s.clip];
    if (!dims) return;
    const cropAspect = (s.crop.w * dims.width) / (s.crop.h * dims.height);
    const deviation = Math.abs(cropAspect - projectAspect) / projectAspect;
    if (deviation > CROP_ASPECT_TOLERANCE) {
      throw new Error(
        `segments[${i}].crop: clip "${s.clip}" (source ${dims.width}x${dims.height}) crop aspect ` +
          `${cropAspect.toFixed(3)} deviates from project aspect ${projectAspect.toFixed(3)} by ` +
          `more than ${CROP_ASPECT_TOLERANCE * 100}%`,
      );
    }
  });
}

/** Escapes text for ffmpeg drawtext (backslash, colon, single quote, percent) */
function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/%/g, "\\%");
}

/** atempo only supports 0.5-2.0 -> speeds outside that range are decomposed into a chain */
function atempoChain(speed: number): string[] {
  const parts: number[] = [];
  let s = speed;
  while (s > 2) {
    parts.push(2);
    s /= 2;
  }
  while (s < 0.5) {
    parts.push(0.5);
    s *= 2;
  }
  parts.push(Number(s.toFixed(6)));
  return parts.map((p) => `atempo=${p}`);
}

/**
 * Cross-clamps a cut's transitionIn/transitionOut durations against each other so they never
 * overlap: each is first clamped to outputDurationS individually (unchanged from before), then, if
 * their SUM still exceeds outputDurationS, both are scaled down proportionally (ratio preserved) so
 * dIn + dOut <= outputDurationS, floored at 0.1s each. Without this, e.g. a 1.5s cut with a 2s
 * transitionIn and a 2s transitionOut each independently clamp to 1.5s - the two fade/dip windows
 * then span the ENTIRE cut and overlap each other, compounding into a near-total blackout instead
 * of the intended in->hold->out envelope (reproduced via a real render, see plan.test.ts and
 * QA-2's transition_collision_strip.png). Shared by both the video side (applyTransition) and the
 * audio side (transitionAudioFilters) so the two stay in lockstep.
 */
function clampTransitionDurations(
  transitionIn: CueSheet["segments"][number]["transitionIn"],
  transitionOut: CueSheet["segments"][number]["transitionOut"],
  outputDurationS: number,
): { dIn: number; dOut: number } {
  const MIN_S = 0.1;
  let dIn = transitionIn ? Math.min(transitionIn.durationS, outputDurationS) : 0;
  let dOut = transitionOut ? Math.min(transitionOut.durationS, outputDurationS) : 0;
  const sum = dIn + dOut;
  if (sum > outputDurationS && sum > 0) {
    const scale = outputDurationS / sum;
    if (transitionIn) dIn = Math.max(MIN_S, dIn * scale);
    if (transitionOut) dOut = Math.max(MIN_S, dOut * scale);
  }
  return { dIn, dOut };
}

/**
 * Video-side fade/dip at one edge of a cut (PRD backlog #3). Offsets are on the segment's own
 * OUTPUT timeline: "in" starts at st=0, "out" ends at st=outputDurationS (i.e. starts at
 * outputDurationS-d). d is the already cross-clamped duration for this side (see
 * clampTransitionDurations) rather than the raw transition.durationS, so a transitionIn+transitionOut
 * pair that would otherwise overlap on a short cut never produces overlapping fade windows.
 *
 * "fade" fades the whole composited frame (video+subtitle+title, since this runs last in the
 * per-clip video chain) directly to/from black via the plain `fade` filter - a single filter link.
 *
 * "dip" instead overlays a separate black layer whose alpha ramps 0<->dim (dim<1 = a partial dip
 * that never fully hides the frame) - the exact same alpha-overlay technique as the title backdrop
 * dim above (`color=black,format=yuva420p,fade=...:alpha=1,colorchannelmixer=aa=<dim>` then
 * `overlay`), just windowed to the cut boundary instead of held for a title's whole duration:
 * - "in": alpha starts at dim (t=0) and fades OUT to 0 by t=d (`fade=t=out`), i.e. the cut
 *   opens fully dipped and reveals the footage.
 * - "out": alpha starts at 0 and fades IN to dim by the cut's end (`fade=t=in`), i.e. the footage
 *   is covered by the dip right before the cut ends.
 * Each side's own color layer spans the clip's whole outputDurationS so its alpha value is exactly
 * 0 outside its own transition window (no separate `enable` clause needed, unlike the title
 * backdrop which needs one because it shares the frame with non-title footage on either side).
 */
function applyTransition(
  filters: string[],
  vLabel: string,
  i: number,
  side: "in" | "out",
  transition: NonNullable<CueSheet["segments"][number]["transitionIn"]>,
  d: number,
  outputDurationS: number,
  W: number,
  H: number,
  fps: number,
): string {
  const st = side === "in" ? 0 : outputDurationS - d;

  if (transition.type === "fade") {
    const label = `vtx${side}${i}`;
    filters.push(`[${vLabel}]fade=t=${side}:st=${st}:d=${d}[${label}]`);
    return label;
  }

  const dim = transition.dim ?? 1;
  const alphaFade = side === "in" ? `fade=t=out:st=0:d=${d}:alpha=1` : `fade=t=in:st=${st}:d=${d}:alpha=1`;
  const colorLabel = `dip${side}${i}`;
  filters.push(
    `color=black:size=${W}x${H}:duration=${outputDurationS}:rate=${fps},format=yuva420p,` +
      `${alphaFade},colorchannelmixer=aa=${dim}[${colorLabel}]`,
  );
  const label = `vdip${side}${i}`;
  filters.push(`[${vLabel}][${colorLabel}]overlay=0:0[${label}]`);
  return label;
}

/**
 * Audio-side fade for the same cut boundary transitions, regardless of type (fade/dip) - both get
 * a plain `afade` over the same [st, st+d] window as the video side (screen-spec/PRD: "audio afade
 * same windows"). dIn/dOut are the same cross-clamped durations passed to applyTransition (see
 * clampTransitionDurations) so the audio and video envelopes always agree. Returns filter fragments
 * meant to be appended to a clip's existing audio chain.
 */
function transitionAudioFilters(
  transitionIn: CueSheet["segments"][number]["transitionIn"],
  transitionOut: CueSheet["segments"][number]["transitionOut"],
  dIn: number,
  dOut: number,
  outputDurationS: number,
): string[] {
  const parts: string[] = [];
  if (transitionIn) {
    parts.push(`afade=t=in:st=0:d=${dIn}`);
  }
  if (transitionOut) {
    parts.push(`afade=t=out:st=${outputDurationS - dOut}:d=${dOut}`);
  }
  return parts;
}

/**
 * Effective subtitle style per segment = shallow merge, in order: global subtitleStyle < named
 * preset (if segment.stylePreset references one in cue.subtitleStylePresets) < segment.styleOverride
 * (per-cut override always wins last). background is the one exception at each merge step and is
 * replaced wholesale rather than partially merged (avoids ambiguous leftovers like opacity from a
 * partial merge) — since each step is itself a shallow merge that overwrites whole object fields,
 * this rule is satisfied without any extra handling. Mirrored field-for-field by the web editor's
 * live preview (apps/web/src/lib/subtitleOverlay.ts's mergeSubtitleStyle) - see ARCHITECTURE.md.
 */
export function resolveSubtitleStyle(cue: CueSheet, segment: Segment): CueSheet["subtitleStyle"] {
  let style = cue.subtitleStyle;
  if (segment.stylePreset) {
    const preset = cue.subtitleStylePresets?.[segment.stylePreset];
    if (preset) {
      style = { ...style, ...preset };
    }
  }
  if (segment.styleOverride) {
    style = { ...style, ...segment.styleOverride };
  }
  return style;
}

function drawtextFilter(text: string, style: CueSheet["subtitleStyle"]): string {
  const t = escapeDrawtext(text);
  let base =
    `drawtext=text='${t}':fontsize=${style.size}:fontcolor=${style.color}` +
    `:borderw=${style.outlineWidth}:bordercolor=${style.outlineColor}:font='${style.font}'`;
  if (style.background) {
    const { color, opacity, padding } = style.background;
    base += `:box=1:boxcolor=${color}@${opacity}:boxborderw=${padding}`;
  }
  const x = "(w-text_w)/2";
  let y: string;
  switch (style.position) {
    case "top":
      y = String(style.margin);
      break;
    case "center":
      y = "(h-text_h)/2";
      break;
    default:
      y = `h-text_h-${style.margin}`; // bottom
  }
  return `${base}:x=${x}:y=${y}`;
}

/** Relative tolerance for the crop-vs-project-aspect check (1%). */
const CROP_ASPECT_TOLERANCE = 0.01;

/**
 * Cheap heuristic for "this subtitle might overflow the frame" - drawtext never wraps text, so a
 * run of characters with no spaces just draws off both edges of the frame once it's wide enough.
 * This is a rough character-count-vs-estimated-pixel-width guard, not a precise prediction (exact
 * wrap parity with drawtext isn't feasible without the actual font metrics) - it's the last-resort
 * guard right before the real ffmpeg render, mirroring the same heuristic/ratio the web editor
 * shows at edit time (apps/web/src/lib/subtitleOverflow.ts).
 */
const AVG_CHAR_WIDTH_RATIO = 0.6;

function longestUnwrappableToken(text: string): string {
  return text
    .split(/\s+/)
    .reduce((longest, token) => (token.length > longest.length ? token : longest), "");
}

function subtitleOverflowWarning(text: string, fontSizePx: number, frameWidthPx: number): string | null {
  const token = longestUnwrappableToken(text);
  if (token.length === 0) {
    return null;
  }
  const estimatedWidthPx = token.length * fontSizePx * AVG_CHAR_WIDTH_RATIO;
  if (estimatedWidthPx <= frameWidthPx) {
    return null;
  }
  return `a ${token.length}-character run with no spaces may not fit the frame width at render (estimate only, drawtext doesn't wrap)`;
}
