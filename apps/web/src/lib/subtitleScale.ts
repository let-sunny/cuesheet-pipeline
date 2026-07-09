import type { CueSheet, SubtitleStyle, SubtitleStyleOverride } from "@cuesheet/schema";

/**
 * Must be kept in sync with the caps in schema.ts's subtitleStyleSchema/subtitleBackgroundSchema
 * (if the schema-side cap changes, change this too) — clamp caps used when scaling for a 4K preset switch.
 */
const MARGIN_MIN = 8;
const MARGIN_MAX = 600;
const PADDING_MIN = 0;
const PADDING_MAX = 120;
const SIZE_MIN = 1;
const OUTLINE_WIDTH_MIN = 0;

function clamp(value: number, min: number, max?: number): number {
  const rounded = Math.round(value);
  const withMin = Math.max(min, rounded);
  return max !== undefined ? Math.min(max, withMin) : withMin;
}

/** Proportionally scales subtitleStyle's (global) absolute px fields
 * (size/outlineWidth/margin/background.padding) by the height ratio (scale) and clamps to the schema range. */
function scaleSubtitleStyle(style: SubtitleStyle, scale: number): SubtitleStyle {
  return {
    ...style,
    size: clamp(style.size * scale, SIZE_MIN),
    outlineWidth: clamp(style.outlineWidth * scale, OUTLINE_WIDTH_MIN),
    margin: clamp(style.margin * scale, MARGIN_MIN, MARGIN_MAX),
    background: style.background
      ? { ...style.background, padding: clamp(style.background.padding * scale, PADDING_MIN, PADDING_MAX) }
      : style.background,
  };
}

/** styleOverride is partial, so only the fields that are set are scaled (omitted fields still follow the global value). */
function scaleStyleOverride(override: SubtitleStyleOverride, scale: number): SubtitleStyleOverride {
  const scaled: SubtitleStyleOverride = { ...override };
  if (override.size !== undefined) {
    scaled.size = clamp(override.size * scale, SIZE_MIN);
  }
  if (override.outlineWidth !== undefined) {
    scaled.outlineWidth = clamp(override.outlineWidth * scale, OUTLINE_WIDTH_MIN);
  }
  if (override.margin !== undefined) {
    scaled.margin = clamp(override.margin * scale, MARGIN_MIN, MARGIN_MAX);
  }
  if (override.background) {
    scaled.background = {
      ...override.background,
      padding: clamp(override.background.padding * scale, PADDING_MIN, PADDING_MAX),
    };
  }
  return scaled;
}

/**
 * Called when switching resolution presets (720/1080/4K) in the render settings dialog. If only
 * project.width/height were changed, the absolute px values of subtitleStyle/styleOverride
 * (size/margin/outlineWidth/background.padding) would stay as-is, making the subtitle shrink
 * proportionally relative to the screen (both cqw/margin%-based preview and render are based on
 * absolute px) — so this scales the global style and every segment's styleOverride proportionally
 * by the height ratio to preserve the perceived on-screen size.
 */
export function scaleCueSheetForResolution(
  cuesheet: CueSheet,
  newWidth: number,
  newHeight: number,
): CueSheet {
  const scale = newHeight / cuesheet.project.height;
  if (scale === 1) {
    return { ...cuesheet, project: { ...cuesheet.project, width: newWidth, height: newHeight } };
  }
  return {
    ...cuesheet,
    project: { ...cuesheet.project, width: newWidth, height: newHeight },
    subtitleStyle: scaleSubtitleStyle(cuesheet.subtitleStyle, scale),
    segments: cuesheet.segments.map((s) =>
      s.styleOverride ? { ...s, styleOverride: scaleStyleOverride(s.styleOverride, scale) } : s,
    ),
  };
}
