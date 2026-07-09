import { join } from "node:path";
import type { CueSheet, Segment } from "@cuesheet/schema";
import { escapeFilterPath, type TitleAsset } from "./title.js";

export { buildSrt, secondsToSrtTimestamp } from "./srt.js";
export {
  buildTitleAssContent,
  DEFAULT_TITLE_CACHE_DIR,
  prepareTitleAssets,
  titleCacheKey,
} from "./title.js";
export type { TitleAsset, TitleAssAsset, TitleFramesAsset } from "./title.js";

export interface RenderPlan {
  /** Full argument list to follow "ffmpeg" */
  args: string[];
  /** -filter_complex graph (for debugging/verification) */
  filterComplex: string;
  outputPath: string;
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
   * Prepared title-card assets (ASS file paths / captured PNG-sequence directories), keyed by
   * segment index - see title.ts's prepareTitleAssets. buildRenderPlan itself stays pure/sync (no
   * ffprobe, no Playwright); the CLI/web server call prepareTitleAssets first and pass the result
   * here. A segment with a `title` but no matching entry here throws a fieldpath-style error
   * (segments[i].title: ...) rather than silently skipping the title.
   */
  titleAssets?: Record<number, TitleAsset>;
}

/**
 * Converts a cuesheet into an ffmpeg render plan (command arguments).
 * Each segment is trimmed -> sped up -> scaled -> fps-normalized -> subtitled (if any),
 * then joined via concat; if bgm is present, its start time (adelay) and volume are
 * applied and mixed in with amix.
 *
 * Units are seconds. Clip paths are assembled from clipDir + filename (so moving the folder doesn't break things).
 */
export function buildRenderPlan(
  cue: CueSheet,
  outputPath: string,
  opts?: RenderPlanOptions,
): RenderPlan {
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
  // Set when any segment wires in a captured-frames title (gooey/melt/particle) - see the
  // -filter_complex_threads note near the end of this function for why.
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

    if (o.title && o.titleAsset) {
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

      if (o.titleAsset.kind === "ass") {
        const assLabel = `vass${i}`;
        filters.push(`[${vLabel}]subtitles=${escapeFilterPath(o.titleAsset.path)}[${assLabel}]`);
        vLabel = assLabel;
      } else {
        usesFrameOverlayTitle = true;
        inputs.push("-framerate", String(o.titleAsset.fps), "-i", join(o.titleAsset.dir, "frame_%04d.png"));
        const titleInputIdx = idx++;
        const titleLabel = `vtitle${i}`;
        filters.push(
          `[${vLabel}][${titleInputIdx}:v]overlay=0:0:format=auto:enable='between(t,0,${durationS})'[${titleLabel}]`,
        );
        vLabel = titleLabel;
      }
    }

    const aParts = ["asetpts=PTS-STARTPTS"];
    if (speed !== 1) aParts.push(...atempoChain(speed));
    if (vol !== 1) aParts.push(`volume=${vol}`);
    filters.push(`[${i}:a]${aParts.join(",")}[a${i}]`);

    concatLabels.push(`[${vLabel}]`, `[a${i}]`);
    clipCount++;
  }

  if (cue.intro) addClip(cue.intro, {});
  // Cumulative output-timeline start time per segment (speed-adjusted) — used to place narration audio at that time.
  // v1 constraint: intro duration can't be known without probing the file, so it's not included in this offset.
  let segmentOffset = 0;
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
    });
    if (cue.narration?.enabled && s.narration) {
      narrationCues.push({ path: join(cue.narration.dir, s.narration), start: segmentOffset });
    }
    segmentOffset += (s.out - s.in) / s.speed;
  });
  if (cue.outro) addClip(cue.outro, {});

  const n = clipCount;
  filters.push(`${concatLabels.join("")}concat=n=${n}:v=1:a=1[vout][amain]`);

  const mixLabels: string[] = [];
  if (cue.bgm.length > 0) {
    for (const b of cue.bgm) {
      inputs.push("-i", b.file);
      const i = idx++;
      const delay = Math.round(b.start * 1000);
      const dur = b.end - b.start;
      filters.push(
        `[${i}:a]atrim=0:${dur},adelay=${delay}|${delay},volume=${b.volume}[bgm${i}]`,
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

  const filterComplex = filters.join(";");
  // Multiple simultaneous captured-frames title overlays (gooey/melt/particle) in one render -
  // each its own image2-sequence input feeding an `overlay` branch ahead of `concat` - deadlocks
  // ffmpeg's default multi-threaded filter graph scheduler (empirically confirmed 2026-07-09:
  // reproducible with 3+ such branches in one filter_complex, CPU usage flatlines mid-encode with
  // no forward progress). Forcing single-threaded filter execution serializes the graph and
  // reliably avoids it - filter execution isn't the render's bottleneck (encode is), so this
  // costs negligible wall-clock time. Scoped to only when it's actually needed (a captured-frames
  // title is present) so cuesheets without one (the overwhelming majority) are unaffected.
  const args = [
    ...inputs,
    ...(usesFrameOverlayTitle ? ["-filter_complex_threads", "1"] : []),
    "-filter_complex",
    filterComplex,
    "-map",
    "[vout]",
    "-map",
    finalAudio,
    "-r",
    String(fps),
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-y",
    outputPath,
  ];
  return { args, filterComplex, outputPath, warnings };
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
 * Effective subtitle style per segment = shallow merge, in order: global subtitleStyle < named
 * preset (if segment.stylePreset references one in cue.subtitleStylePresets) < segment.styleOverride
 * (per-cut override always wins last). background is the one exception at each merge step and is
 * replaced wholesale rather than partially merged (avoids ambiguous leftovers like opacity from a
 * partial merge) — since each step is itself a shallow merge that overwrites whole object fields,
 * this rule is satisfied without any extra handling. Mirrored field-for-field by the web editor's
 * live preview (packages/web/src/lib/subtitleOverlay.ts's mergeSubtitleStyle) - see ARCHITECTURE.md.
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
 * shows at edit time (packages/web/src/lib/subtitleOverflow.ts).
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
