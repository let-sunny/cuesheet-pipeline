# 골: 예정 기능 완성 + ffmpeg 환경 + 편집 편의성

## 목표
CLAUDE.md의 "예정" 기능을 실제 동작까지 완성한다:
web 손편집 에디터, render 실인코딩(E2E), ffmpeg 환경 구축. 편의성을 높이는 기능 추가·구조 변경 허용.

## 범위
포함:
- ffmpeg 설치(brew) 및 render E2E 검증 — 실제 mp4 산출, ffprobe로 확인
- 테스트용 샘플 클립 생성(레포 로컬 `media/clips/`), 시드 큐시트 clipDir 갱신
- web: 뷰어 → 에디터 승격
  - 세그먼트 편집(in/out/speed/volume/subtitle), 추가/삭제/순서 이동
  - 프로젝트 설정·자막 스타일·BGM 편집
  - 저장 API(Vite 미들웨어 POST) + `validateCueSheet` 검증, 에러는 `필드경로: 이유`로 표시
  - 클립 정적 서빙 + `<video>` 세그먼트 구간 미리보기(편의성 핵심)
- 검증: `pnpm -r typecheck && pnpm -r test` 초록 + 실런타임 관찰

제외:
- bridge 툴 확장(2-툴 설계는 의도적 — 유지)
- 웹에서 렌더 실행 버튼(렌더는 CLI로 충분, 다음 싸이클 후보)
- 스키마 확장(트랜지션/페이드 등)은 이번엔 안 함 — 편집 종류가 실제로 필요해질 때

## 산출물
- `media/clips/` 샘플 클립 + 갱신된 `project.cuesheet.json`
- web 편집 UI + 저장 엔드포인트 + 비디오 미리보기
- render E2E로 뽑힌 `out.mp4` (검증 후 삭제 가능)
- CLAUDE.md "현재 상태" 갱신

## 제약 (CLAUDE.md)
- 시간 단위 초, 클립은 파일명만, 타입은 z.infer 파생, 이모지 금지
- 검증 메시지 `필드경로: 이유` 형식, web·render 모두 validateCueSheet 사용

## 가정
- clipDir `<home>/videos/clips`는 실존하지 않음 → 레포 로컬 `media/clips`로 변경.
  실클립이 생기면 clipDir만 바꾸면 됨(스키마 설계 의도대로).
- 샘플 클립은 ffmpeg testsrc/sine으로 생성(저작권·용량 문제 없음).
- 자막 폰트 Pretendard 미설치 가능성 → 렌더 검증은 시스템 폰트 폴백 허용, 실패 시 폰트 지정 방식 보완.
- 편의성 기능 중 이번 싸이클 선택: 웹 비디오 미리보기 + 완전한 손편집. 그 외는 다음 싸이클.

## 완료기준
- [x] ffmpeg/ffprobe 사용 가능 (자막 drawtext는 `ffmpeg-full` 필요 — render README 참고)
- [x] 샘플 클립 존재, 시드 큐시트가 유효(validateCueSheet 통과)
- [x] `cuesheet-render`로 실제 mp4 생성, ffprobe로 해상도·길이 확인(자막 포함) — 1920x1080/30fps/13s, 자막 프레임 확인
- [x] web에서 편집→저장→파일 반영, 잘못된 값은 에러 표시로 저장 차단 — POST 검증 라이브 확인
- [x] 외부 변경(bridge/직접 수정) 시 웹 자동 갱신 유지
- [x] 웹에서 세그먼트 비디오 미리보기 재생
- [x] `pnpm -r typecheck && pnpm -r test` 초록
- [x] CLAUDE.md 현재 상태 갱신
