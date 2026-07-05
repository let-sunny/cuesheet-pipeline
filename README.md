# cuesheet-pipeline

큐시트(JSON) 기반으로 무성 조각영상을 자동 조립하는 영상 편집 파이프라인.

## 모노레포 구조

```
packages/
  schema/   큐시트 타입 정의 + 런타임 검증 (single source of truth)  [현재 구현됨]
  web/      큐시트를 편집/미리보기하는 웹앱 (큐시트 생산)             [예정]
  render/   큐시트를 받아 실제 영상을 렌더링, ffmpeg 등 (큐시트 소비)  [예정]
```

### 데이터 흐름 (누가 만들고 누가 쓰나)

```
  web  ──(큐시트 JSON)──▶  render  ──▶  최종 영상.mp4
 편집·미리보기            렌더링
```

웹앱에서 큐시트를 전부 편집하고, 그 결과 JSON을 렌더러가 받아 최종본을 뽑는다.

### 의존 방향 (누가 누구를 import 하나)

```
  web  ──▶  schema  ◀──  render
```

- `schema`는 web·render가 모두 import하는 **계약(contract)** 이다.
  타입과 zod 스키마를 한곳에서 정의해 두 쪽이 **같은 규칙**을 공유한다.
- 웹앱은 `validateCueSheet`로 저장 전에 검증하고, 렌더러는 렌더 직전에 다시 검증한다.
  (같은 스키마이므로 웹이 통과시킨 큐시트는 렌더러도 반드시 통과)
- `schema`는 web/render에 의존하지 않는다 → 순환 없음, 계약이 항상 중심.
- 시간 단위는 **초(second)** 기준. 프레임 환산은 render 모듈이 `fps`로 처리한다.
- 클립 경로는 **파일명만** 저장하고 폴더는 `clipDir`로 분리 → 폴더를 옮겨도 안 깨진다.

## 개발

```bash
pnpm install
pnpm -r build      # 전체 빌드
pnpm -r typecheck  # 타입 체크
pnpm -r test       # 테스트
```
