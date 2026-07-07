# @cuesheet/web

큐시트(`CueSheet` JSON)를 편집하고 렌더까지 실행하는 브라우저 에디터. "내 전용
Vrew"의 터치업 단계 — `@cuesheet/draft`가 만든 초벌 큐시트를 사람이 다듬는 화면이다.

세 스텝으로 구성된다(`StepNav`):

1. **구성** — 초벌 파이프라인이 뽑은 순간(moment) 후보를 훑어보고(`MomentPalette`)
   본편에 담을 컷을 고른다.
2. **인스펙터** — 컷별로 in/out, 배속, 볼륨, 자막, 크롭(무왜곡 비율 잠금 +
   확장 가능), 컷별 자막 스타일 오버라이드(`SegmentStyleOverride`)를 조정한다.
   인접 컷 병합, 순서 이동도 여기서.
3. **마무리** — 프로젝트 메타, 전역 자막 스타일, 나레이션, BGM, 인트로/아웃트로,
   렌더 해상도 프리셋(720p/1080p/4K — 전환 시 자막 크기·마진·외곽선을 높이 비율로
   비례 스케일, `subtitleScale.ts`)을 설정하고 렌더를 실행한다.

## 실행

```bash
pnpm --filter @cuesheet/web dev
```

기본 주소는 http://localhost:5173 (Vite 기본 포트).

## CUESHEET_PATH / MOMENTS_PATH

편집 대상 큐시트는 `CUESHEET_PATH`로 지정한다(기본: 저장소 루트
`project.cuesheet.json`). 구성 스텝에서 보여줄 순간 후보 목록(`moments.json`,
`@cuesheet/draft`의 `assemble` 입력과 동일 포맷)은 `MOMENTS_PATH`로 지정한다
(기본: `media/drafts/dotmix_v4/moments.json`).

```bash
CUESHEET_PATH=/path/to/other.cuesheet.json pnpm --filter @cuesheet/web dev
```

## 저장 / 검증

`POST /api/cuesheet`가 저장 전 `validateCueSheet`로 검증한다. 실패하면
`필드경로: 이유` 형식 메시지를 반환하고 저장하지 않는다 — 웹에서 저장을 통과한
큐시트는 render도 반드시 통과한다(같은 스키마).

## 렌더 실행

마무리 스텝의 렌더 버튼이 `POST /api/render`를 호출한다. 디스크에 저장된
큐시트를 읽어 `@cuesheet/render`의 `buildRenderPlan`을 그대로 재사용해 ffmpeg를
실행하고, 저장소 루트에 `out.mp4`를 만든다(`GET /out.mp4`로 다운로드). 저장 안
한(dirty) 상태면 버튼이 비활성화되고, 렌더 진행 중 동시 요청은 409로 거절된다
(모듈 스코프 플래그, 큐잉 없음). 진행률은 `GET /api/render/status`로 폴링.

## 자막 다운로드

`GET /api/subtitles.srt`가 저장된 큐시트의 세그먼트를 SRT로 변환해 서빙한다
(변환 로직은 `src/srt.ts` — 순수 함수라 스크립트/CLI에서도 재사용 가능).

## 라이브 갱신

개발 서버가 대상 큐시트 파일을 `fs.watch`로 감시한다. 파일이 바뀌면(브리지의
자연어 편집 포함) HMR 채널로 `cuesheet:changed` 이벤트를 보내고, 웹앱은 이를
받아 `/api/cuesheet`를 다시 fetch해 화면을 즉시 갱신한다. 새로고침이 필요 없다.

## 빌드 / 타입체크

```bash
pnpm --filter @cuesheet/web build      # tsc --noEmit + vite build
pnpm --filter @cuesheet/web typecheck  # tsc --noEmit
```
