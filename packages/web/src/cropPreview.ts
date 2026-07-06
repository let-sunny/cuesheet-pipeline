import type { CSSProperties } from "react";
import type { Crop } from "@cuesheet/schema";

/**
 * crop이 있는 세그먼트의 미리보기용 CSS 근사치.
 * 렌더(@cuesheet/render)는 실제로 ffmpeg crop 필터로 잘라낸 뒤 project 크기로 늘려 채우는데,
 * 웹 미리보기에서 그 픽셀 결과를 그대로 재현할 필요는 없다(렌더가 최종 진실) — 여기서는
 * <video>를 감싼 overflow:hidden 컨테이너 안에서 scale+translate로 crop 영역만
 * 보이도록 시뮬레이션해 "크롭됐는데 얼굴이 그대로 보이는" 문제만 없애면 충분하다.
 *
 * transform-origin을 (0,0)으로 고정하고 scale(1/w, 1/h) translate(-x*100%, -y*100%)를
 * 적용하면 crop 사각형의 좌상단(x,y)이 컨테이너 좌상단(0,0)에, 우하단(x+w,y+h)이
 * 컨테이너 우하단(1,1)에 오도록 맞춰진다. translate의 %는 요소(비디오) 자신의
 * 레이아웃 박스 크기 기준이라 scale과 곱해지지 않으므로 이 순서로 충분하다.
 */
export function cropPreviewStyle(crop: Crop | null | undefined): CSSProperties | undefined {
  if (!crop) {
    return undefined;
  }
  const { x, y, w, h } = crop;
  return {
    transformOrigin: "0 0",
    transform: `scale(${1 / w}, ${1 / h}) translate(${-x * 100}%, ${-y * 100}%)`,
  };
}
