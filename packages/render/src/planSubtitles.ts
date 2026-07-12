import type { CueSheet, Segment } from "@cuesheet/schema";

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

export function drawtextFilter(text: string, style: CueSheet["subtitleStyle"]): string {
  const t = escapeDrawtext(text);
  let base =
    `drawtext=text='${t}':fontsize=${style.size}:fontcolor=${style.color}` +
    `:borderw=${style.outlineWidth}:bordercolor=${style.outlineColor}:font='${style.font}'`;
  if (style.background) {
    const { color, opacity, padding } = style.background;
    // Asymmetric box border: horizontal (right/left) is 2x the vertical (top/bottom), so the box
    // breathes on the sides more than top/bottom (YouTube caption style). drawtext boxborderw takes
    // top|right|bottom|left (a single value would pad all sides equally, leaving the text flush
    // against the box's left/right edges). SYNC: apps/web's subtitleBackgroundPadding uses the same
    // 2x-horizontal ratio so the preview matches. Needs a recent ffmpeg (multi-value boxborderw).
    base += `:box=1:boxcolor=${color}@${opacity}:boxborderw=${padding}|${padding * 2}|${padding}|${padding * 2}`;
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

/**
 * Cheap heuristic for "this subtitle might overflow the frame" - drawtext never wraps text, so a
 * run of characters with no spaces just draws off both edges of the frame once it's wide enough.
 * This is a rough character-count-vs-estimated-pixel-width guard, not a precise prediction (exact
 * wrap parity with drawtext isn't feasible without the actual font metrics) - it's the last-resort
 * guard right before the real ffmpeg render, mirroring the same heuristic/ratio the web editor
 * shows at edit time (apps/web/src/lib/subtitleOverflow.ts).
 */
export function subtitleOverflowWarning(text: string, fontSizePx: number, frameWidthPx: number): string | null {
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

/** Escapes text for ffmpeg drawtext (backslash, colon, single quote, percent) */
function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/%/g, "\\%");
}

function longestUnwrappableToken(text: string): string {
  return text
    .split(/\s+/)
    .reduce((longest, token) => (token.length > longest.length ? token : longest), "");
}

const AVG_CHAR_WIDTH_RATIO = 0.6;
