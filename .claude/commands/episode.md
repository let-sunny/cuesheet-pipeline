---
description: 원본 폴더 하나로 초벌 편집본(큐시트) 자동 생성 - v4 파이프라인 전체 지시서
argument-hint: <원본 폴더 경로>
---

새 에피소드 원본 폴더 하나를 받아 스캔부터 초벌 큐시트까지 끝까지 완주한다.
이 커맨드를 실행하는 주체(현재 세션)가 오케스트레이션을 맡는다 - 별도 모델
승격 없이 지금 세션 그대로 진행하되, (2) 비전 판독만 클립별로 sonnet 서브에이전트에
병렬 위임한다. 질문으로 막지 말고 CLAUDE.md의 자율 원칙을 따른다.

입력: `$ARGUMENTS` = 원본 폴더 경로(절대/상대 둘 다 가능).

## 금지 사항

- **렌더 자동 실행 금지.** 초벌 큐시트를 만드는 것까지가 이 커맨드의 범위 - 사용자가
  에디터에서 검토·수정한 뒤 직접 렌더 버튼을 눌러야 한다.
- **원본 폴더 수정 금지.** 읽기 전용으로만 다룬다(iCloud placeholder를 실수로 다운로드
  트리거하지 않도록 `stat -f %b`로 blocks 확인 후에만 읽는다).

## 절차

### (1) 스캔

```bash
pnpm episode "$ARGUMENTS" --scan-only
```

이미 `media/drafts/<슬러그>/manifest.json`이 있으면 스크립트가 자동으로 스캔을
건너뛴다(멱등). 다시 스캔하려면 `--rescan`을 붙여 재실행한다.
출력에서 슬러그(폴더명 기반 안전화된 이름), 로컬/미다운로드 클립 수를 확인해 이후
단계에서 쓸 `media/drafts/<슬러그>/manifest.json` 경로와 `episodes/<슬러그>.cuesheet.json`
목표 경로를 확정한다.

### (2) 비전 판독 (moments.json)

`manifest.json`의 클립마다 **서브에이전트를 병렬로**(모델: sonnet) 띄워 프레임을 보고
`media/drafts/<슬러그>/moments.json`을 작성한다. 각 서브에이전트는 자기 클립의
`frames` 목록(경로+시각)만 보고 판단하고, 결과는 아래 스키마를 만족하는 `ClipMoments`
객체 하나를 반환한다. 전부 모이면 배열로 합쳐 파일로 쓴다.

**스키마** (`packages/draft/src/types.ts`의 zod 정의와 반드시 일치):

```ts
type ShotType = "hand-closeup" | "object" | "cat" | "change" | "reveal" | "wearing" | "other";

interface Moment {
  inS: number;
  outS: number;
  shotType: ShotType;
  memo: string;       // 화면 묘사 (한국어, 자막 초안의 근거가 됨)
  quality: number;     // 1~5, 3 이상만 초벌에 채택됨
}

interface MonotonousRange {
  startS: number;
  endS: number;
  desc: string;
  faceExposed: boolean; // 필수 - 이 구간(배속 커넥터 후보)에 얼굴 노출 위험이 있는지
}

interface ClipMoments {
  clip: string;               // manifest.json의 clip name과 동일
  clipSummary: string;
  moments: Moment[];
  monotonousRanges: MonotonousRange[];
}
```

`monotonousRanges[].faceExposed`는 **항상 명시**한다(생략하면 assemble이 desc 텍스트
휴리스틱으로 폴백하는데, 이는 부정확할 수 있는 안전망이지 기본 경로가 아니다).

**판단 규칙**:

- **얼굴 공개 정책(절대 규칙)**: 얼굴은 턱끝까지만 노출 허용(입술 포함 그 위가 보이면
  위반). 사용자 본인은 물론 가족 등 타인 얼굴도 동일 기준. 위반 프레임이 있는 moment는
  `memo`에 `[얼굴노출]` 태그를 붙이고 `quality: 1`로 낮춰 채택 우선순위에서 밀어낸다
  (완전 배제하지 않는 이유: 에디터에서 세로 크롭으로 살릴 수 있어 팔레트에는 남겨야 함).
- **롱테이크(300초 이상 클립) coarse-to-fine**: 먼저 60초 간격으로 훑어 변화가 보이는
  구간만 찾고, 그 구간을 1~2초 간격으로 재귀적으로 좁혀 들어간다. 전체를 촘촘히 보지
  않는다(낭비) - 변화 없는 구간은 `monotonousRanges`로만 기록한다.
- **iCloud 미다운로드 클립**: manifest.json의 `evicted` 목록에 있는 클립은 프레임이
  없으므로 건너뛴다(다운로드 트리거 금지).
- **시크는 항상 `-ss`를 `-i` 앞에 둔다**(이미 scan 단계에서 이렇게 프레임을 뽑았으므로
  여기선 해당 없음 - 추가로 프레임을 더 뽑아야 하는 경우에만 적용되는 규칙).
- 대본 순서 = 영상 시간 순서(브이로그 특성) - 전역 재배열 매칭이 아니라 순서 보존
  탐색이라는 전제를 유지한다.

### (2.5) 풀기 서사 패스 (롱테이크가 있을 때만)

5분 이상 롱테이크는 단일 프레임 판독으로 "실수/풀기(frogging)" 서사를 놓친다 —
편물이 자라다 **줄어드는** 순간은 인접 프레임 쌍을 비교해야 보인다 (v4 실측: 정답
풀기 지점 브래킷 성공, 대조군 오탐 0).

1. 쌍 스케줄 생성: `node -e` 로 `@cuesheet/draft`의 `buildPairSchedule(manifest)` 호출
   → 클립별 인접 프레임 쌍 목록.
2. 쌍마다 두 프레임을 Read로 비교 판정(병렬 서브에이전트 불필요 — 수십 쌍 수준):
   `{clip, tA, tB, verdict: grew|shrank|same|unclear, confidence 1-5, note}` 를
   `media/drafts/<슬러그>/progress.json`에 기록 (zod: `progressFileSchema`).
   shrank = 편물 감소/바늘에서 빠짐/실뭉치로 되돌아감.
3. `extractNarrativeEvents(judgments)` 로 이벤트 추출 → **mistake_discovered 지점을
   moments.json에 quality 5 순간으로 추가**(desc에 "풀기 발견" 명시, 실수 서사는
   사용자 편집 문법의 핵심 스토리 비트), resumed 지점은 quality 4로 추가. 시각은
   이벤트 atS 근방에서 프레임 재확인 후 정밀화(±60초 그리드이므로 필요시 그 구간만
   15초 간격 재추출).

### (3) 조립

빌드가 최신인지 먼저 확인한다(직전에 draft 소스를 건드렸다면 dist가 낡아있을 수 있다 -
사고 전례 있음):

```bash
pnpm --filter @cuesheet/draft build
```

그다음 조립:

```bash
node packages/draft/dist/cli.js assemble \
  --manifest media/drafts/<슬러그>/manifest.json \
  --moments media/drafts/<슬러그>/moments.json \
  --clip-dir "$ARGUMENTS" \
  --project-name "<슬러그>" \
  --width 1920 --height 1080 --fps 30 \
  --out episodes/<슬러그>.cuesheet.json
```

`--boundary-pad`는 기본값(0.4초)을 쓴다. assemble이 내부적으로 quality>=3 채택,
컷 리듬 수렴(평균 2.8~3.0초), 단조 구간 배속 커넥터(speed 14, 30~60초 슬라이스,
에피소드당 최대 8개, 얼굴 노출 위험 구간 자동 제외) 규칙을 적용하고
`validateCueSheet`로 검증까지 마친 뒤 저장한다. 실패하면 CLI가
`필드경로: 이유` 형식으로 원인을 stderr에 출력하고 exit 1 - moments.json을 고쳐 재시도한다.

### (4) 자막 말투 패스

`docs/voice-guide.md`를 필독하고 그 규칙을 따라 `episodes/<슬러그>.cuesheet.json`의
`segments[].subtitle`을 다시 쓴다(assemble 직후엔 `memo`가 그대로 들어가 있어 화면
묘사체이지 자막체가 아니다). 원칙:

- **근거는 항상 memo(화면 내용)** - 코퍼스 문장을 그대로 복붙하지 않는다(말투만 빌려온다).
- 목표 25자 내외(3초 컷 리듬), 줄바꿈 금지, 이모지 금지.
- 고양이는 반드시 "고앵이" 표기.
- 완성/리빌 컷은 "짜잔"류, 에피소드 마지막 컷은 "안녕~~"류 인사.

### (5) 얼굴 크롭 제안

`[얼굴노출]` 태그가 붙은 순간이 채택됐거나, 배속 커넥터의 원본 `desc`에 얼굴 노출
위험이 있으면 해당 세그먼트에 세로 크롭을 제안한다. **비율 잠금(크롭 폭==높이, 정사각형
또는 그에 준하는 좁은 비율)**으로 턱끝 라인 아래까지만 남도록 크롭 좌표를 정하고,
해당 시각 프레임을 다시 확인해 크롭 후에도 턱끝 위가 노출되지 않는지 검증한다.
에디터에서 언제든 해제 가능한 제안이므로 과감하게 걸어도 된다 - 놓치는 쪽이 더 나쁘다.

### (6) 검증 + 서버 전환

- `episodes/<슬러그>.cuesheet.json`이 (3)에서 이미 `validateCueSheet`를 통과한 상태다.
  (4)/(5)에서 자막·크롭을 직접 수정했다면 저장 전 다시 `validateCueSheet`로 확인한다
  (직접 JSON을 고쳤다면 schema 드리프트 가능성이 있으므로).
- 웹 서버가 이 에피소드의 `CUESHEET_PATH`로 떠 있는지 확인한다. `pnpm episode`가
  이미 서버를 그 경로로 띄웠으면 그대로 두고, 다른 에피소드용으로 떠 있었다면
  사용자에게 재시작이 필요하다고 안내한다(자동으로 죽이고 재기동하지 않는다 -
  사용자가 다른 작업 중일 수 있음).

### (7) 보고

짧게, 사실 위주로:

- 컷 수 / 총 길이(초·분:초)
- 얼굴 노출 처리 건수(크롭 제안/quality 강등)
- 배속 커넥터 삽입 개수
- 에디터 URL (`http://localhost:5173`)
- 다음 할 일: "에디터에서 본편 재생으로 훑고 다듬어라" (이 커맨드는 초벌까지만)

## 참고

- 시간 단위는 초, 클립 경로는 파일명만(`segment.clip`) - CLAUDE.md 핵심 규약 참고.
- 실측 정답지 기준(로우키/닷믹스): 자막당 평균 2.9~3초, 자막 한 줄 = 한 컷, 배속 컷은 드묾.
- 과거 실행 수치·검증 이력은 `docs/STATUS.md`에 누적되어 있다 - 이번 결과도 마일스톤이면
  거기 추가하고 커밋할지는 사용자 승인 후 판단(이 커맨드 자체는 커밋하지 않는다).
