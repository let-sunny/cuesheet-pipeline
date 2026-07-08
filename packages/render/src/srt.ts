import type { CueSheet } from "@cuesheet/schema";

/** 초 단위 시각을 SRT 타임스탬프(HH:MM:SS,mmm)로 포맷한다. */
export function secondsToSrtTimestamp(totalSeconds: number): string {
  const ms = Math.max(0, Math.round(totalSeconds * 1000));
  const hh = Math.floor(ms / 3600000);
  const mm = Math.floor((ms % 3600000) / 60000);
  const ss = Math.floor((ms % 60000) / 1000);
  const mmm = ms % 1000;
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return `${pad(hh)}:${pad(mm)}:${pad(ss)},${pad(mmm, 3)}`;
}

/**
 * 세그먼트를 순서대로 훑으며 출력 타임라인 시각((out-in)/speed 누적)을 SRT로 변환한다.
 * 자막이 빈 컷은 스킵하고 인덱스는 남은 큐만으로 연속 재부여한다.
 * intro/outro는 narration 오프셋과 동일한 v1 제약으로 이 누적에 포함하지 않는다
 * (render/plan.ts 참고 — intro 길이를 파일 프로빙 없이 알 수 없어서).
 *
 * 큐시트를 소비해 출력물(SRT)을 만드는 로직이라 render 패키지 소속 —
 * web(cuesheet-plugin.ts)의 /api/subtitles.srt 라우트와 CLI(--srt) 둘 다 이 함수를 그대로 쓴다.
 */
export function buildSrt(cue: CueSheet): string {
  let cursor = 0;
  let index = 1;
  const blocks: string[] = [];
  for (const seg of cue.segments) {
    const start = cursor;
    const end = cursor + (seg.out - seg.in) / seg.speed;
    cursor = end;
    const text = seg.subtitle.trim();
    if (text === "") {
      continue;
    }
    blocks.push(`${index}\n${secondsToSrtTimestamp(start)} --> ${secondsToSrtTimestamp(end)}\n${text}\n`);
    index += 1;
  }
  return blocks.join("\n");
}
