import type { CSSProperties } from "react";
import type { SubtitleStyle, SubtitleStyleOverride, SubtitleStylePresets } from "@cuesheet/schema";

/**
 * Shallow-merges, in order: global subtitleStyle < named preset (if stylePreset references one in
 * presets) < segment styleOverride (per-cut override always wins last). Same merge order as the
 * render package's resolveSubtitleStyle (packages/render/src/plan.ts) — background is replaced
 * wholesale at each step rather than partially merged (if a step has it, that step's background is
 * used as-is). Keeps the preview (VideoPreview/SequencePlayer) and the actual render always seeing
 * the same merge result (see ARCHITECTURE.md's contracts section).
 */
export function mergeSubtitleStyle(
  global: SubtitleStyle,
  presets: SubtitleStylePresets | undefined,
  stylePreset: string | null | undefined,
  override: SubtitleStyleOverride | null | undefined,
): SubtitleStyle {
  let style = global;
  if (stylePreset) {
    const preset = presets?.[stylePreset];
    if (preset) {
      style = { ...style, ...preset };
    }
  }
  if (override) {
    style = { ...style, ...override };
  }
  return style;
}

/**
 * CSS style approximating drawtext's borderw (outline). Draws a continuous outline wrapping the
 * entire letter stroke via -webkit-text-stroke, then draws the fill (text color) on top via
 * paint-order: stroke (same "outline behind, text in front" order as the render), staying smooth
 * even as thickness or font size grows.
 *
 * Previously this used a 4-direction (diagonal) text-shadow offset approximation, but as the offset
 * (outline width) grew, there was no shadow between the diagonals (on the up/down/left/right axes),
 * so the outline appeared to split into 4 separate copies (especially noticeable on cuts where a
 * per-cut styleOverride enlarged the size).
 * widthCss is a CSS length that already has a unit attached (px/cqw/etc).
 */
export function subtitleOutlineStyle(widthPx: number, widthCss: string, color: string): CSSProperties {
  if (widthPx <= 0) {
    return {};
  }
  return {
    WebkitTextStroke: `${widthCss} ${color}`,
    paintOrder: "stroke",
  };
}

/** Subtitle background box padding as a CSS `padding` value. The schema's single `padding` is the
 * VERTICAL amount; the horizontal is doubled so the box breathes on the sides more than top/bottom
 * (YouTube caption style - a cut's text used to sit flush against the box's left/right edges).
 * SYNC: packages/render/src/planSubtitles.ts derives its drawtext boxborderw the same way, so the
 * preview and the exported video match. */
export function subtitleBackgroundPadding(padding: number): string {
  return `${padding}px ${padding * 2}px`;
}

/** #rgb or #rrggbb + 0-1 opacity -> a CSS rgba() string (for previewing the subtitle background box). */
export function subtitleBackgroundRgba(hex: string, opacity: number): string {
  const m3 = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/.exec(hex);
  const full = m3 ? `${m3[1]}${m3[1]}${m3[2]}${m3[2]}${m3[3]}${m3[3]}` : hex.slice(1);
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * Converts subtitleStyle.position/margin (raw px) into a stage top/bottom offset (% of stage height).
 * If margin is missing (an old cuesheet served without validation), falls back to the schema default (40).
 * center is handled by a CSS class (top:50%/translateY), so this returns an empty object for it.
 */
export function subtitlePositionStyle(style: SubtitleStyle, projectHeight: number): CSSProperties {
  const marginPct = `${((style.margin ?? 40) / Math.max(1, projectHeight)) * 100}%`;
  if (style.position === "top") {
    return { top: marginPct };
  }
  if (style.position === "bottom") {
    return { bottom: marginPct };
  }
  return {};
}

/**
 * Converts a project pixel-unit value (font size, outline width, etc) into a container-query cqw
 * (container query width) unit string. An ancestor of the element using this value must have
 * `container-type: inline-size` set, in which case 1cqw = 1% of that ancestor box's actual rendered
 * width — so no matter what size the box renders at (including responsive shrinking), the real ratio
 * of "what % of referenceWidth (usually project.width) is this" is always preserved.
 */
export function toCqw(px: number, referenceWidth: number): string {
  return `${(px / Math.max(1, referenceWidth)) * 100}cqw`;
}

/** input[type=color] only accepts #rrggbb — expand a #rgb shorthand before passing it in. */
export function toColorInputValue(hex: string): string {
  const m = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/.exec(hex);
  if (m) {
    const [, r, g, b] = m;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#000000";
}
