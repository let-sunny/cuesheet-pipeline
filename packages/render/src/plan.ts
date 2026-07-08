import { join } from "node:path";
import type { CueSheet, SubtitleStyleOverride } from "@cuesheet/schema";

export { buildSrt, secondsToSrtTimestamp } from "./srt.js";

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

  function addClip(
    path: string,
    o: {
      ss?: number;
      dur?: number;
      speed?: number;
      volume?: number;
      subtitle?: string;
      crop?: CueSheet["segments"][number]["crop"];
      styleOverride?: CueSheet["segments"][number]["styleOverride"];
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
    if (burnSubtitles && o.subtitle && o.subtitle.length > 0) {
      const style = effectiveSubtitleStyle(cue.subtitleStyle, o.styleOverride);
      vParts.push(drawtextFilter(o.subtitle, style));
    }
    filters.push(`[${i}:v]${vParts.join(",")}[v${i}]`);

    const aParts = ["asetpts=PTS-STARTPTS"];
    if (speed !== 1) aParts.push(...atempoChain(speed));
    if (vol !== 1) aParts.push(`volume=${vol}`);
    filters.push(`[${i}:a]${aParts.join(",")}[a${i}]`);

    concatLabels.push(`[v${i}]`, `[a${i}]`);
    clipCount++;
  }

  if (cue.intro) addClip(cue.intro, {});
  // Cumulative output-timeline start time per segment (speed-adjusted) — used to place narration audio at that time.
  // v1 constraint: intro duration can't be known without probing the file, so it's not included in this offset.
  let segmentOffset = 0;
  const narrationCues: { path: string; start: number }[] = [];
  cue.segments.forEach((s, i) => {
    if (burnSubtitles && s.subtitle.length > 0) {
      const style = effectiveSubtitleStyle(cue.subtitleStyle, s.styleOverride);
      const overflow = subtitleOverflowWarning(s.subtitle, style.size, W);
      if (overflow) {
        warnings.push(`segments[${i}].subtitle: ${overflow}`);
      }
    }
    addClip(join(cue.clipDir, s.clip), {
      ss: s.in,
      dur: s.out - s.in,
      speed: s.speed,
      volume: s.volume,
      subtitle: s.subtitle,
      crop: s.crop,
      styleOverride: s.styleOverride,
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
  const args = [
    ...inputs,
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
 * Effective subtitle style per segment = shallow merge of styleOverride onto the global subtitleStyle.
 * background is the one exception and is replaced wholesale (avoids ambiguous leftovers like
 * opacity from a partial merge) — since the shallow merge overwrites whole object fields anyway,
 * this rule is satisfied without any extra handling.
 * If override is absent (omitted/null), the global style is used as-is.
 */
function effectiveSubtitleStyle(
  global: CueSheet["subtitleStyle"],
  override?: SubtitleStyleOverride | null,
): CueSheet["subtitleStyle"] {
  if (!override) return global;
  return { ...global, ...override };
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
