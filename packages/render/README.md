# @cuesheet/render

큐시트를 받아 **ffmpeg 명령**으로 본편 영상을 렌더한다. 큐시트 소비자.

## 사용

라이브러리:

```ts
import { buildRenderPlan } from "@cuesheet/render";
import { validateCueSheet } from "@cuesheet/schema";

const cue = validateCueSheet(json);
if (cue.ok) {
  const plan = buildRenderPlan(cue.data, "out.mp4");
  // plan.args → spawn("ffmpeg", plan.args)
}
```

CLI (ffmpeg 필요):

```bash
cuesheet-render project.cuesheet.json out.mp4
```

## 동작

각 세그먼트를 트림(`-ss`/`-t`) → 배속(setpts/atempo) → 스케일·fps 정규화 → 자막(drawtext, 있으면)
처리한 뒤 `concat`으로 이어 붙인다. intro/outro는 앞뒤로. bgm은 시작 시각(`adelay`)·볼륨 적용 후
`amix`로 섞는다. 출력은 project의 fps·해상도, H.264/AAC mp4.

### 세그먼트 크롭 (선택)

`segment.crop`이 있으면 그 세그먼트의 필터 체인에서 **트림 직후, 스케일 전에**
`crop=w=iw*{w}:h=ih*{h}:x=iw*{x}:y=ih*{y}`를 적용한다(원본 해상도 기준 비율이라
`iw`/`ih` 표현식으로 해상도 독립적으로 계산됨). crop 이후 종횡비가 바뀔 수 있지만,
뒤이은 `scale=W:H`가 원래도(=crop 없는 세그먼트도) 종횡비 보존 없이 project 해상도로
그대로 늘려 채우므로 별도 letterbox/pad 처리는 필요 없다 — crop 세그먼트도 같은
규칙을 그대로 탄다. `crop` 필드가 없으면 ffmpeg 명령이 기존과 100% 동일하다.

### 목소리 클로닝 내레이션 (피처 플래그)

`narration.enabled === true`이고 세그먼트에 `narration`(파일명)이 있을 때만 동작한다.
`narration` 필드 자체가 없거나 `enabled: false`면 ffmpeg 명령이 기존과 **100% 동일**하다.

- 파일 경로는 `narration.dir` + 세그먼트별 `narration`(파일명만, `clipDir`/`segment.clip`와 같은 철학).
- 각 내레이션 오디오는 **그 세그먼트의 출력 타임라인 시작 시각**(intro 이후 세그먼트 누적,
  배속 반영: `(out-in)/speed`를 앞 세그먼트들에 대해 누적한 값)에 `adelay`로 배치되고
  `narration.volume` 적용 후 기존 오디오(원본 소리+bgm)와 `amix`로 섞인다(bgm과 같은 패턴).
- **v1 제약**: 내레이션 파일 길이가 그 컷 길이보다 길면 잘리지 않고 다음 컷 위로 겹쳐
  재생된다(자동 트림 없음). 또한 이 시작 시각 계산은 intro 길이를 포함하지 않는다(파일
  프로빙 없이 intro 길이를 알 수 없음 — intro를 쓰면서 내레이션도 쓰는 경우 오프셋이 밀릴 수 있음).

## 주의

- **ffmpeg가 설치돼 있어야 실제 인코딩이 된다.** 없으면 CLI가 명확한 에러를 낸다.
- **자막(drawtext)에는 `libfreetype`/`fontconfig`가 빌드에 포함된 ffmpeg가 필요하다.**
  macOS Homebrew의 기본 `ffmpeg` 포뮬러는 이 라이브러리들이 빠져 있어 `drawtext` 필터를
  못 찾는 에러(`No such filter: 'drawtext'`)가 난다. `brew install ffmpeg-full`로 설치한 뒤
  `PATH`에서 그 바이너리가 먼저 잡히게 해야 한다(`ffmpeg-full`은 keg-only):
  ```bash
  export PATH="/opt/homebrew/opt/ffmpeg-full/bin:$PATH"
  ```
  (자막이 없는 큐시트라면 기본 `ffmpeg`로도 충분하다.)
- 자막 drawtext는 폰트가 필요하다(fontconfig 또는 `fontfile=`). subtitleStyle.font 이름으로
  요청하며, 시스템에 해당 폰트가 없으면 fontconfig가 기본 폰트로 폴백한다(한글 렌더링은 됨,
  지정한 폰트와 다르게 보일 수 있음). 정확한 폰트가 필요하면 fontfile 경로로 바꿔야 한다.
- 실 클립(`cut_01.mp4`+`cut_02.mp4`, `project.cuesheet.json`)으로 `cuesheet-render` E2E를
  검증함: 1920x1080/30fps/13s mp4가 정상 산출되고 자막도 바이너리 프레임으로 확인됨.
- atempo는 0.5~2.0만 지원 → 범위 밖 배속은 자동으로 체인 분해한다.
