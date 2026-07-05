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
- `CueSheet`, `Segment`, `BgmCue`, `SubtitleStyle`, `Project` 타입
- `CueSheetInput` — 검증 전 입력 타입(default 미적용), 웹앱 편집 상태용
- `validateCueSheet(json)` → `{ ok: true, data } | { ok: false, errors: string[] }`

## 검증 규칙

- `segment.in < segment.out`, `segment.speed > 0`
- `segments` 최소 1개
- `bgm.start < bgm.end`, `bgm.volume` 0~1
- `project.fps/width/height` 양수 (width/height는 정수)
- 색상은 `#RGB` 또는 `#RRGGBB` hex
- 실패 시 `필드경로: 이유` 형식의 메시지 배열

## 규약

- 시간 단위는 **초**. 프레임 환산은 render가 fps로.
- `segment.clip`은 **파일명만**, 폴더는 `clipDir`. → 폴더 이동에 안 깨짐.

예제: [`examples/sample.cuesheet.json`](./examples/sample.cuesheet.json)
