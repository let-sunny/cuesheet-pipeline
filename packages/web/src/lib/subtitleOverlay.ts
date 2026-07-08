import type { CSSProperties } from "react";
import type { SubtitleStyle, SubtitleStyleOverride } from "@cuesheet/schema";

/**
 * Shallow-merges a segment's styleOverride onto the global subtitleStyle. Same rule as the render
 * package's effectiveSubtitleStyle (packages/render/src/plan.ts) — background is replaced wholesale
 * rather than partially merged (if override has it, override.background is used as-is).
 * Keeps the preview (VideoPreview/SequencePlayer) and the actual render always seeing the same merge result.
 */
export function mergeSubtitleStyle(
  global: SubtitleStyle,
  override: SubtitleStyleOverride | null | undefined,
): SubtitleStyle {
  if (!override) {
    return global;
  }
  return { ...global, ...override };
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
