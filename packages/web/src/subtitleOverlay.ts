import type { CSSProperties } from "react";
import type { SubtitleStyle, SubtitleStyleOverride } from "@cuesheet/schema";

/**
 * 전역 subtitleStyle에 세그먼트 styleOverride를 얕은 병합한다. render 패키지의
 * effectiveSubtitleStyle(packages/render/src/plan.ts)과 동일한 규칙 — background는
 * 부분 병합이 아니라 통짜 교체된다(override에 있으면 override.background를 그대로 쓴다).
 * 미리보기(VideoPreview/SequencePlayer)와 실제 렌더가 항상 같은 병합 결과를 보게 한다.
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

/** drawtext 재현이 아니라 대략적인 외곽선 미리보기용 텍스트 그림자. widthCss는 이미 단위가 붙은 CSS 길이(px/cqw 등). */
export function subtitleOutlineShadow(
  color: string,
  widthPx: number,
  widthCss: string,
): string | undefined {
  if (widthPx <= 0) {
    return undefined;
  }
  const w = widthCss;
  return [
    `-${w} -${w} 0 ${color}`,
    `${w} -${w} 0 ${color}`,
    `-${w} ${w} 0 ${color}`,
    `${w} ${w} 0 ${color}`,
  ].join(", ");
}

/** #rgb 또는 #rrggbb + 0~1 투명도 -> css rgba() 문자열(자막 배경 박스 미리보기용). */
export function subtitleBackgroundRgba(hex: string, opacity: number): string {
  const m3 = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/.exec(hex);
  const full = m3 ? `${m3[1]}${m3[1]}${m3[2]}${m3[2]}${m3[3]}${m3[3]}` : hex.slice(1);
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * subtitleStyle.position/margin(원본 px)을 스테이지 top/bottom 오프셋(스테이지 높이 대비 %)으로
 * 환산한다. margin이 없는(검증 없이 서빙된 구 큐시트) 경우 schema 기본값(40)으로 대체한다.
 * center는 CSS 클래스(top:50%/translateY)가 처리하므로 빈 객체를 반환한다.
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

/** input[type=color]는 #rrggbb만 받는다 — #rgb 축약형을 늘려서 넘긴다. */
export function toColorInputValue(hex: string): string {
  const m = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/.exec(hex);
  if (m) {
    const [, r, g, b] = m;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#000000";
}
