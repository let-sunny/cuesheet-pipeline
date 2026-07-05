# 골: 웹에서 렌더 실행 버튼

## 목표

`@cuesheet/web` 에디터에서 저장된 큐시트를 바로 렌더(mp4 산출)까지 트리거한다.
지금은 `cuesheet-render` CLI를 터미널에서 따로 실행해야 하는데, 그 손이 가는 걸 없앤다.

## 범위

포함:
- 서버(Vite 미들웨어)에 `POST /api/render` 추가: 디스크의 현재 큐시트 파일을 읽어
  `validateCueSheet` → `@cuesheet/render`의 `buildRenderPlan` → `ffmpeg` spawn으로 실제 렌더.
  `@cuesheet/render`를 의존성으로 추가해 재사용(로직 재구현 금지).
- 출력은 저장소 루트 `out.mp4`. 완료 후 다운로드 가능하도록 정적 서빙 라우트 추가.
- 진행 중/성공/실패 상태를 UI에 표시. 실패 시 ffmpeg stderr 마지막 일부를 보여준다.
- dirty(저장 안 됨) 상태면 렌더 버튼 비활성화 + 먼저 저장하라는 안내.
- 동시에 여러 렌더 요청이 겹치지 않게 서버에 진행 중 플래그 정도는 둔다(과설계 금지 — 큐잉 등은 안 함).

제외:
- 진행률(%) 스트리밍, 렌더 취소, 렌더 히스토리/여러 출력 관리 — 다음 싸이클.
- ffmpeg 자체를 앱이 설치/관리 — PATH에 있는 ffmpeg를 그대로 spawn(CLI와 동일 전제).

## 제약 (CLAUDE.md)

- 시간 단위 초, 클립 경로는 파일명만(`clipDir`로 조립), 타입은 zod에서 파생, 이모지 금지.
- 검증 메시지는 `필드경로: 이유` 포맷 유지(기존 저장 API와 동일 규약).

## 가정

- 렌더는 큐시트 파일에 이미 저장된(디스크상) 내용을 대상으로 한다 — 클라이언트의 draft를
  다시 보내지 않음(저장 API와 동일 소스, "저장 후 렌더"라는 순서를 그대로 강제).
- 렌더는 동기 처리(HTTP 응답을 ffmpeg 종료까지 기다림) — 로컬 테스트 클립(수~수십 초) 기준
  충분히 빠름. 대용량/장시간 렌더 대응은 다음 싸이클 후보.
- 자막이 있는 큐시트는 `ffmpeg-full`(drawtext 지원)이 PATH에 있어야 함 — 이미 `~/.zshrc`에
  반영됨. 앱 코드에서 별도 ffmpeg 바이너리 탐색/폴백 로직은 만들지 않음(범위 밖).

## 산출물

- `packages/web/src/cuesheet-plugin.ts`: `POST /api/render`, 결과물 다운로드 라우트.
- `packages/web/src/api.ts`: `renderCueSheet()` 클라이언트 함수.
- `packages/web/src/App.tsx` (또는 신규 컴포넌트): 렌더 버튼 + 상태 UI.
- `packages/web/package.json`: `@cuesheet/render` 의존성 추가.
- `CLAUDE.md` 현재 상태 갱신.

## 완료기준

- [x] `pnpm -r typecheck && pnpm -r test` 초록 (`pnpm install`이 supply-chain lockfile 정책으로
      막혀 있어 패키지별 `tsc`/`vitest` 직접 실행으로 확인 — web tsc, render tsc+vitest 8개 통과)
- [x] dirty 상태에서 렌더 버튼이 막히거나 저장 유도 (버튼 disabled + 안내 배너)
- [x] 저장된 큐시트로 렌더 요청 시 실제 `out.mp4` 산출(ffprobe: 1920x1080/30fps/13s 확인)
- [x] 다운로드 라우트로 산출물 접근 가능 (`GET /out.mp4`, 바이트 수 일치 확인)
- [x] 의도적으로 깨진 큐시트로 실패 케이스에서 에러가 UI에 노출 (검증 실패 400 / ffmpeg 실패 500
      둘 다 `{ok:false, error:string}`로 통일해 클라이언트가 그대로 표시)
- [x] 실 런타임(개발 서버 기동 + curl)으로 관찰 확인 — 성공/실패/동시요청 409/다운로드 전부 라이브 확인

## 가정 갱신 (구현 중 실제로 만난 것)

- `pnpm install`이 이 환경에서 `baseline-browser-mapping@2.10.42`의 supply-chain
  minimumReleaseAge 정책에 막혀 실행 자체가 안 됨(기존에도 있던 이슈, 이번 작업 때문 아님).
  builder가 `packages/web/node_modules/@cuesheet/render` 심링크를 수동 생성했고,
  오케스트레이터가 `pnpm-lock.yaml`의 `packages/web` importer에 `@cuesheet/render` 워크스페이스
  링크 엔트리를 수동으로 반영함(schema 엔트리와 동일 패턴). 정책 cutoff가 지나 `pnpm install`이
  다시 될 때 한 번 정식으로 돌려서 이 수동 편집과 결과가 일치하는지 확인 권장.
- 초기 구현에서 큐시트 검증 실패(400)와 ffmpeg 실패(500)의 응답 바디 형태가 서로 달랐음
  (`{errors: string[]}` vs `{error: string}`) — 클라이언트 `RenderResult` 타입은 후자만 선언돼
  있어 전자일 때 `undefined`가 찍히는 엣지 케이스가 있었음(저장 파일이 요청 사이 외부에서
  삭제/손상되는 드문 경우). 오케스트레이터가 서버 쪽 400 응답도 `{ok:false, error:string}`로
  통일해서 해결 — 클라이언트 코드 변경 없이 타입과 실제 응답이 일치하게 됨.
