# @cuesheet/web

큐시트의 라이브 미리보기 웹앱. `project.cuesheet.json`을 읽어 프로젝트 정보,
세그먼트 타임라인, BGM 목록, 자막 스타일을 화면에 렌더한다.

## 실행

```bash
pnpm --filter @cuesheet/web dev
```

기본 주소는 http://localhost:5173 (Vite 기본 포트). 개발 서버는
`GET /api/cuesheet` 엔드포인트로 큐시트 JSON을 그대로 서빙한다.

## CUESHEET_PATH

미리보기할 큐시트 파일 경로는 환경변수 `CUESHEET_PATH`로 지정한다.
지정하지 않으면 저장소 루트의 `project.cuesheet.json`을 사용한다.

```bash
CUESHEET_PATH=/path/to/other.cuesheet.json pnpm --filter @cuesheet/web dev
```

## 라이브 갱신

개발 서버가 대상 큐시트 파일을 `fs.watch`로 감시한다. 파일이 바뀌면
HMR 채널로 `cuesheet:changed` 이벤트를 보내고, 웹앱은 이를 받아
`/api/cuesheet`를 다시 fetch해 화면을 즉시 갱신한다. 새로고침이 필요 없다.

## 빌드 / 타입체크

```bash
pnpm --filter @cuesheet/web build      # tsc --noEmit + vite build
pnpm --filter @cuesheet/web typecheck  # tsc --noEmit
```
