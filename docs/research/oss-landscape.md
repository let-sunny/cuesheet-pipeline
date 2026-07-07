# OSS 지형 리서치 — 구성요소별 공개 가치 (2026-07-08)

> 목적: 모노레포 구성요소 중 "다른 사람에게도 유용한 것" 분류. 스타 수는 GitHub API 실측.
> 결론 요약은 맨 아래 판정표. 상세 비교는 세션 리서치 리포트 기반.

## 핵심 발견 3개

1. **draft(비전 기반 무대사 초벌)의 여집합 포지션이 시장 규모로 확인됨.**
   "에이전트 영상 편집"의 최대 화제작 video-use(15.9k 스타, 신생 폭발)가 공식 문서에
   "LLM은 영상을 안 보고 읽는다(Audio is primary)"라고 한계를 명시 — 무대사 원본(브이로그·
   크래프트·작업 영상)은 이 물결 전체가 못 다루는 영역. auto-editor의 motion 모드가 유일한
   인접인데, 우리 실측(뜨개 롱테이크 씬 점수 0.09, 하이라이트와 무상관)이 그 방식의 반례.
   "VLM 프레임 판독 + 시크 coarse-to-fine + 순서 보존"의 실전 OSS는 발견되지 않음.

2. **schema+render는 'editly의 후계' 자리가 비어 있음.**
   가장 유사한 선행 editly(JSON spec→ffmpeg, 5.4k 스타)가 14개월 방치(이슈 80개).
   OTIO는 교환 포맷(렌더 의미론 없음), 상용 JSON→영상 API들(json2video/Shotstack)은
   시장 검증만 제공. "zod 스키마=계약(z.infer, 검증 에러 '필드경로: 이유') + 로컬 ffmpeg
   렌더"는 빈자리. 단 카테고리 자체는 커머디티라 폭발력 제한.

3. **bridge(MCP 편집)는 패턴이 독창적이나 단독으론 소품.**
   기존 MCP 영상 편집은 NLE 원격조종(davinci-resolve-mcp 1.4k) 아니면 ffmpeg 단발 래퍼.
   "검증되는 JSON 문서를 공유 상태로 두고 AI와 사람이 무충돌 병행 편집"이라는 문서-계약형
   패턴은 없음 — schema와 묶어 발표할 때 가치.

## 판정표

| 구성요소 | 주목 가능성 | 포지셔닝 한 줄 |
|---|---|---|
| draft | **높음** | "video-use가 못 보는 영상을 위한 도구 — 무대사 원본에서 VLM 프레임 판독으로 초벌 편집. 씬 감지 0건 롱테이크 실측 데이터 동봉" |
| schema+render(+bridge) | 중 | "editly의 정신적 후계 — zod 계약 큐시트 + ffmpeg 렌더 + Claude Code가 편집하는 MCP까지 한 벌" |
| bridge 단독 | 중(패턴)/저(규모) | "MCP로 앱이 아니라 문서를 조종하라" |
| schema 단독 | 저~중 | OTIO/editly 인접 점유 |
| web | 저 | OpenCut(61.7k)이 범용 점유 — 개인 문법 특화로 유지 |

## 참고 좌표 (주요 프로젝트)
Remotion 52.4k(코드=영상, 상용 라이선스) · OpenMontage 35.0k(에이전트 영상 제작) ·
video-use 15.9k(전사 기반 에이전트 편집) · moviepy 14.8k · ShortGPT 7.7k · FunClip 5.9k ·
editly 5.4k(방치) · auto-editor 4.5k · OTIO 1.9k · davinci-resolve-mcp 1.4k · OpenCut 61.7k
