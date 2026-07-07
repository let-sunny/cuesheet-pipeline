import type { CueSheet, SubtitleStyle, SubtitleStyleOverride } from "@cuesheet/schema";

/**
 * schema.ts의 subtitleStyleSchema/subtitleBackgroundSchema 상한과 반드시 일치시켜야
 * 한다(스키마 쪽 상한을 바꾸면 여기도 같이 바꿀 것) — 4K 프리셋 전환 스케일 시 클램프 상한.
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

/** subtitleStyle(전역)의 절대 px 필드(size/outlineWidth/margin/background.padding)를
 * height 비율(scale)만큼 비례 스케일하고 스키마 범위로 클램프한다. */
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

/** styleOverride는 partial이라 지정된 필드만 스케일한다(생략된 필드는 여전히 전역 값을 따름). */
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
 * 렌더 설정 다이얼로그의 해상도 프리셋 전환(720/1080/4K) 시 호출한다. project.width/height만
 * 바꾸면 subtitleStyle/styleOverride의 절대 px 값(size/margin/outlineWidth/background.padding)이
 * 그대로 남아 화면 대비 자막이 비율적으로 작아지므로(cqw·margin% 기반 미리보기/렌더 모두
 * 절대 px 기준), height 비율만큼 전역 스타일과 모든 세그먼트의 styleOverride를 함께
 * 비례 스케일해 화면상 크기감을 유지한다.
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
