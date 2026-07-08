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

/**
 * drawtext borderw(외곽선)를 근사하는 CSS 스타일. -webkit-text-stroke로 글자 획 전체를
 * 감싸는 연속된 외곽선을 그리고, paint-order: stroke로 채움(글자색)을 그 위에 그려
 * (렌더의 "외곽선이 뒤, 글자가 앞" 순서와 동일) 두께나 글자 크기가 커져도 매끈하게 유지된다.
 *
 * 이전엔 text-shadow 4방향(대각선) 오프셋 근사를 썼는데, 오프셋(외곽선 두께)이 커지면
 * 대각선 사이(상/하/좌/우 축)엔 그림자가 없어 외곽선이 4개의 분리된 사본으로 갈라져
 * 보이는 문제가 있었다(특히 컷별 styleOverride로 크기를 키운 컷에서 두드러짐).
 * widthCss는 이미 단위가 붙은 CSS 길이(px/cqw 등).
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

/**
 * project 픽셀 단위 값(폰트 크기·외곽선 두께 등)을 컨테이너 쿼리 cqw(container query
 * width) 단위 문자열로 바꾼다. 이 값을 쓰는 요소의 조상에 `container-type: inline-size`가
 * 걸려 있어야 하며, 그러면 1cqw = 그 조상 박스의 실제 렌더 폭의 1%다 — 박스가 어떤
 * 크기로(반응형 축소 포함) 렌더되든 "referenceWidth(보통 project.width) 대비 몇 %인가"라는
 * 진짜 비율이 항상 유지된다.
 */
export function toCqw(px: number, referenceWidth: number): string {
  return `${(px / Math.max(1, referenceWidth)) * 100}cqw`;
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
