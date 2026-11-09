import type { CueSheet, SubtitleStyle } from "@cuesheet/schema";
import { resolveSubtitleStyle } from "./planSubtitles.js";

/**
 * Converts a cuesheet into an .ass (Advanced SubStation Alpha) subtitle file — unlike .srt (plain
 * text + timing only, see srt.ts), .ass carries font/size/color/outline/position/background, so
 * DaVinci Resolve (and most NLEs) import it already styled instead of resetting to the editor's
 * own default subtitle look. This lives in render (not web/draft) per the dependency-direction
 * rule: any logic that consumes a cuesheet to produce an output artifact belongs here.
 *
 * Same cumulative-output-timeline model as buildSrt (intro/outro excluded, same v1 constraint —
 * their duration isn't known without probing the file; cuts with an empty subtitle are skipped).
 * Each segment's effective style (resolveSubtitleStyle: global < preset < per-cut override) is
 * deduped into a named [V4+ Styles] entry and referenced by every Dialogue line that resolves to
 * the same style, so a cuesheet using only the global style produces one clean Style line, not one
 * per cut.
 *
 * Background box is a best-effort approximation (ASS's BorderStyle=3 opaque-box has no separate
 * padding control, unlike drawtextFilter's boxborderw) — the real render (ffmpeg drawtext) is the
 * ground truth for the burned-in look, same philosophy as the web preview's cropPreview.ts/
 * rotatePreview.ts.
 */
export function buildAss(cue: CueSheet): string {
  const { width, height } = cue.project;
  const styleNames = new Map<string, string>();
  const styleLines: string[] = [];

  const styleNameFor = (style: SubtitleStyle): string => {
    const key = JSON.stringify(style);
    const existing = styleNames.get(key);
    if (existing) return existing;
    const name = `Style${styleNames.size + 1}`;
    styleNames.set(key, name);
    styleLines.push(formatStyleLine(name, style));
    return name;
  };

  let cursor = 0;
  const events: string[] = [];
  for (const seg of cue.segments) {
    const start = cursor;
    const end = cursor + (seg.out - seg.in) / seg.speed;
    cursor = end;
    const text = seg.subtitle.trim();
    if (text === "") continue;
    const style = resolveSubtitleStyle(cue, seg);
    const name = styleNameFor(style);
    events.push(
      `Dialogue: 0,${secondsToAssTimestamp(start)},${secondsToAssTimestamp(end)},${name},,0,0,0,,${escapeAssText(text)}`,
    );
  }

  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    ...styleLines,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...events,
  ].join("\n");
}

/** Formats a time in seconds as an ASS timestamp (H:MM:SS.cc, centiseconds). */
export function secondsToAssTimestamp(totalSeconds: number): string {
  const cs = Math.max(0, Math.round(totalSeconds * 100));
  const hh = Math.floor(cs / 360000);
  const mm = Math.floor((cs % 360000) / 6000);
  const ss = Math.floor((cs % 6000) / 100);
  const cc = cs % 100;
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return `${hh}:${pad(mm)}:${pad(ss)}.${pad(cc)}`;
}

function formatStyleLine(name: string, style: SubtitleStyle): string {
  // ASS Alignment is numpad-style (1-9); this schema has no left/right option, so horizontal is
  // always-centered: bottom=2, top=8, center=5.
  const alignment = style.position === "top" ? 8 : style.position === "center" ? 5 : 2;
  // MarginV is unused by most renderers at middle alignment (vertical position is already
  // "middle"), so only top/bottom carry the configured margin.
  const marginV = style.position === "center" ? 0 : style.margin;
  // BorderStyle 3 = opaque box using BackColour (closest ASS equivalent to the background box;
  // no separate padding control, see module doc). BorderStyle 1 = outline+shadow, no box.
  const hasBackground = Boolean(style.background);
  const borderStyle = hasBackground ? 3 : 1;
  const backColour = hasBackground && style.background ? assColor(style.background.color, style.background.opacity) : assColor("#000000", 0);
  const fields = [
    name,
    style.font,
    String(style.size),
    assColor(style.color),
    assColor(style.color),
    assColor(style.outlineColor),
    backColour,
    "0", // Bold
    "0", // Italic
    "0", // Underline
    "0", // StrikeOut
    "100", // ScaleX
    "100", // ScaleY
    "0", // Spacing
    "0", // Angle
    String(borderStyle),
    String(style.outlineWidth), // Outline
    "0", // Shadow
    String(alignment),
    "10", // MarginL
    "10", // MarginR
    String(Math.round(marginV)),
    "1", // Encoding
  ];
  return `Style: ${fields.join(",")}`;
}

/**
 * Converts a `#RRGGBB` hex color (+ optional opacity 0-1) to ASS's `&HAABBGGRR` format - ASS uses
 * BGR byte order (not RGB) and AA is INVERTED alpha (00 = fully opaque, FF = fully transparent).
 */
function assColor(hex: string, opacity = 1): string {
  const clean = hex.replace("#", "");
  const r = clean.slice(0, 2);
  const g = clean.slice(2, 4);
  const b = clean.slice(4, 6);
  const alpha = Math.round((1 - clamp01(opacity)) * 255)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();
  return `&H${alpha}${b.toUpperCase()}${g.toUpperCase()}${r.toUpperCase()}`;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** ASS text escaping: literal newlines -> \N (ASS's own line-break tag), and { }  neutralized so
 * they can't be misread as an override-tag block (ASS has no escape for braces; subtitle text
 * here is plain narration, so this is a defensive strip, not expected to fire in practice). */
function escapeAssText(text: string): string {
  return text.replace(/\r\n|\r|\n/g, "\\N").replace(/[{}]/g, "");
}
