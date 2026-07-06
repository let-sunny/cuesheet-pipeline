# @cuesheet/draft

원본 폴더에서 **초벌 편집 큐시트**를 자동 생성한다. 이 프로젝트의 코어 — "원본 폴더를
던지면 초벌 편집본이 나온다"의 결정적(deterministic) 절반. 프레임을 보고 어떤 순간을
쓸지 고르는 비전 판단은 사람이 아니라 **Claude(Claude Code)의 몫**이고, 이 패키지는 그
앞뒤(스캔·조립)만 담당한다.

## 흐름

```
1. scan       원본 폴더 -> 인벤토리 + 프레임 추출 -> manifest.json
2. (Claude)   manifest.json의 프레임을 Read로 직접 보고 -> moments.json 작성 (비전 판단)
3. assemble   moments.json -> 조립 규칙 적용 -> 큐시트(JSON), validateCueSheet로 검증 후 저장
```

큐시트가 나온 뒤엔 `@cuesheet/web`으로 손편집, `@cuesheet/render`로 렌더한다.

## 사용

```bash
cuesheet-draft scan <원본폴더> --out <작업폴더>
# -> <작업폴더>/manifest.json, <작업폴더>/frames/<클립명>/*.jpg

# (이 사이에 Claude가 frames/를 보고 moments.json을 작성)

cuesheet-draft assemble \
  --manifest <작업폴더>/manifest.json \
  --moments <작업폴더>/moments.json \
  --clip-dir <원본폴더> \
  --project-name "<프로젝트 이름>" \
  --out <큐시트경로>.json \
  [--fps 30] [--width 1280] [--height 720]
```

라이브러리로도 쓸 수 있다:

```ts
import { scanFolder, assembleDraft } from "@cuesheet/draft";
import { validateCueSheet } from "@cuesheet/schema";

const manifest = await scanFolder(srcDir, workDir);
// ... moments 작성 후
const cueInput = assembleDraft(moments, { clipDir, projectName });
const result = validateCueSheet(cueInput); // assembleDraft 자체는 검증하지 않는다
```

## manifest.json (scan 산출물)

```json
{
  "clips": [
    {
      "name": "VID_0001.mp4",
      "durS": 57.6,
      "interval": 5,
      "frames": [{ "t": 0, "path": "/work/frames/VID_0001/t00000.jpg" }]
    }
  ],
  "evicted": ["VID_0002.mp4"]
}
```

- 영상 파일 매칭(`.mp4`/`.mov`)은 확장자 대소문자 무관이다(`.MP4`/`.MOV`도 포함) — 실제
  원본 폴더에 대문자 확장자 클립이 섞여 있어 누락되면 안 된다.
- `evicted`: iCloud 미다운로드(placeholder) 파일. `blocks===0`이면 로컬 실물이 없다는
  뜻이라(읽으면 다운로드를 기다리며 무한 정지) 건너뛴다. `scannedAt` 같은 비결정 값은
  의도적으로 넣지 않는다(같은 입력이면 같은 manifest).
- 프레임 간격은 클립 길이에 비례: 15초 미만 2초, 60초 미만 5초, 300초 미만 15초, 그 이상
  60초. 긴 롱테이크도 시크 기반(`-ss`를 `-i` 앞에)이라 추출 자체는 빠르다 — 다만 60초
  간격만으로는 순간의 정확한 in 지점을 못 잡을 수 있으니, 필요하면 Claude가 변화 구간을
  찾은 뒤 그 구간만 더 촘촘한 간격으로 추가 프레임을 뽑아 확정하는 걸 권장한다(별도 수동
  단계 — scan은 균일 간격 1차 추출만 한다).

## moments.json (Claude가 작성하는 비전 판단 결과)

```json
[
  {
    "clip": "VID_0001.mp4",
    "clipSummary": "손으로 실뭉치를 만지는 장면",
    "moments": [
      {
        "inS": 0,
        "outS": 3,
        "shotType": "hand-closeup",
        "memo": "실뭉치를 손으로 만짐",
        "quality": 4
      }
    ],
    "monotonousRanges": [{ "startS": 10, "endS": 55, "desc": "손으로 계속 뜨는 중" }]
  }
]
```

- `shotType`: `hand-closeup` / `object` / `cat` / `change` / `reveal` / `wearing` / `other`
  (실 편집 문법에서 뽑은 샷 어휘).
- `quality`: 1~5. 3 이상만 정속 하이라이트로 채택된다.
- `monotonousRanges`: 변화 없이 작업만 이어지는 구간. 배속 커넥터 후보.
- `@cuesheet/draft`가 export하는 `momentsFileSchema`(zod)로 검증된다. 실패 시
  `필드경로: 이유` 형식으로 출력하고 종료 코드 1.

## 조립 규칙 (assembleDraft)

- 세그먼트는 **클립 파일명순(=촬영 시간순) -> 클립 내 in 오름차순**. 재배열하지 않는다.
- 정속 하이라이트: `quality >= 3`만 채택, `speed=1` `volume=1`, `subtitle=memo`. 개별 길이는
  2~3.5초로 — moment의 `outS - inS`가 3.5초를 넘으면 `inS` 기준 3.5초로 클램프한다.
  전체 정속 컷 평균이 3.1초를 넘으면 가장 긴 컷부터 0.25초씩 다듬어 평균을 2.8~3.0초로
  수렴시키는 그리디 패스를 한 번 돈다(사용자 실측 리듬 평균 2.95초 기준, 배속 커넥터는
  건드리지 않음).
- 배속 커넥터: 같은 클립의 `monotonousRanges` 중 길이 30초 이상인 구간에서 30~60초
  슬라이스(60초 초과분은 잘라냄)를 `speed=14`(12~16 배속 범위의 중간값)로 넣는다 —
  출력 길이는 슬라이스길이/14로 항상 2.1~4.3초 사이. `subtitle="(빨리감기) <desc>"`.
  에피소드당 최대 8개 상한(남발 방지).
- `intro`/`outro`는 `null` 고정, `bgm`은 빈 배열 — 둘 다 나중에 사람이 손으로 채운다.
- 결과는 검증 전(`CueSheetInput`) 상태로 반환된다. `assembleDraft` 자체는 순수 함수이고
  검증은 호출부(`validateCueSheet`)가 한다 — CLI는 검증 실패 시 `필드경로: 이유`를 출력하고
  종료 코드 1로 끝낸다.

## 주의

- ffprobe/ffmpeg가 `PATH`에 있어야 한다(자막 없는 scan 단계엔 기본 ffmpeg로 충분,
  이후 렌더 단계의 자막은 `@cuesheet/render`의 README 참고 — `ffmpeg-full` 필요).
- scan은 로컬 실물(`blocks>0`)만 처리한다. iCloud 미다운로드 파일을 읽으면 다운로드
  완료까지 무한정 멈추므로 반드시 먼저 걸러낸다.
