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
