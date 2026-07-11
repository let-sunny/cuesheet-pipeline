import { join } from "node:path";
import type { CueSheet } from "@cuesheet/schema";
import { atempoChain } from "./atempo.js";
import { buildDuckingGainExpression, deriveDuckingWindows } from "./ducking.js";
import { assertCropMatchesProjectAspect, type SourceDimensions } from "./planCrop.js";
import { drawtextFilter, resolveSubtitleStyle, subtitleOverflowWarning } from "./planSubtitles.js";
import { applyTransition, clampTransitionDurations, transitionAudioFilters } from "./planTransitions.js";
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

export type { SourceDimensions } from "./planCrop.js";
export { resolveSubtitleStyle } from "./planSubtitles.js";

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

