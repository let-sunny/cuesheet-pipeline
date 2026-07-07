# @cuesheet/schema

큐시트의 **타입 + 런타임 검증**. web/render가 공유하는 계약(contract).

## 사용

```ts
import { validateCueSheet, type CueSheet } from "@cuesheet/schema";

const result = validateCueSheet(jsonFromSomewhere);
if (result.ok) {
  const cue: CueSheet = result.data; // speed 등 default 적용됨
} else {
  console.error(result.errors); // ["segments[0].in: in은 out보다 작아야 합니다 (in < out)", ...]
}
```

## export

- `cueSheetSchema` 등 zod 스키마 (부분 스키마도 개별 export)
- `CueSheet`, `Segment`, `BgmCue`, `SubtitleStyle`, `Project`, `NarrationConfig` 타입
- `CueSheetInput` — 검증 전 입력 타입(default 미적용), 웹앱 편집 상태용
- `validateCueSheet(json)` → `{ ok: true, data } | { ok: false, errors: string[] }`

## 검증 규칙

- `segment.in < segment.out`, `segment.speed > 0`
- `segments` 최소 1개
- `bgm.start < bgm.end`, `bgm.volume` 0~1
- `project.fps/width/height` 양수 (width/height는 정수)
- 색상은 `#RGB` 또는 `#RRGGBB` hex
- `narration.volume` 0~1, `segment.narration`은 빈 문자열 불가(있다면)
- 실패 시 `필드경로: 이유` 형식의 메시지 배열

## 세그먼트 크롭 (선택)

- `segment.crop?: { x, y, w, h }` — 원본 해상도 기준 **비율(0~1)**로 정의(해상도 독립적).
  `x,y`는 좌상단, `w,h`는 크기. 예: 얼굴 상단을 잘라내는 세로 크롭
  `{ x: 0, y: 0.25, w: 1, h: 0.75 }`.
- 제약: `x, y >= 0`, `x + w <= 1`, `y + h <= 1`, `w, h > 0.1`(실수 방지 하한).
- null/생략이면 크롭 없음(원본 그대로) — 기존 큐시트는 그대로 유효하다.
- 렌더 쪽 적용(트림 직후, 스케일 전에 crop 필터)은 `@cuesheet/render` README 참고.

## 컷별 자막 스타일 오버라이드 (선택)

- `segment.styleOverride?: SubtitleStyleOverride | null` — `subtitleStyle`의 모든 필드
  (font/size/color/outlineColor/outlineWidth/position/margin/background)를 전부 선택
  필드로 가진 부분 스키마. 생략하거나 `null`이면 이 컷은 전역 `subtitleStyle` 그대로다.
- 기본은 전역 스타일, 예외적인 컷만 부분 오버라이드하는 설계다 — 컷마다 전체 스타일을
  다시 쓸 필요 없이 바꾸고 싶은 필드만 넣으면 된다.
- **`background`는 예외**: 지정하면 전역 `background`를 부분 병합이 아니라 통짜
  교체한다(부분 병합 시 색만 바꾸고 opacity가 전역 값으로 남는 등 애매함이 생기기
  때문). 배경을 바꾸려면 `color`/`opacity`/`padding`을 전부 넣어야 한다.
- 병합 규칙(어느 필드가 최종 적용되는지)은 `@cuesheet/render`가 구현한다 — 자세한
  내용은 그쪽 README 참고.

## 목소리 클로닝 내레이션 (선택, 피처 플래그)

- `cueSheet.narration?: { enabled: boolean, dir: string, volume: number(0~1, 기본 1) }`
  — 필드가 없으면 완전 비활성, 기존 큐시트는 그대로 유효하다.
- `segment.narration?: string | null` — 이 컷에 얹을 내레이션 오디오 **파일명만**
  (`narration.dir` + 파일명으로 조립, `clipDir`/`segment.clip`과 같은 철학). null/생략이면
  그 컷은 내레이션 없음.
- 렌더 쪽 동작(세그먼트 출력 시작 시각에 믹스, v1 제약)은 `@cuesheet/render` README 참고.

## 규약

- 시간 단위는 **초**. 프레임 환산은 render가 fps로.
- `segment.clip`은 **파일명만**, 폴더는 `clipDir`. → 폴더 이동에 안 깨짐.

예제: [`examples/sample.cuesheet.json`](./examples/sample.cuesheet.json)
