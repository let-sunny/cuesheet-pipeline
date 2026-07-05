import { join } from "node:path";
import type { CueSheet } from "@cuesheet/schema";

export interface RenderPlan {
  /** "ffmpeg" 뒤에 붙일 전체 인자 */
  args: string[];
  /** -filter_complex 그래프 (디버깅/검증용) */
  filterComplex: string;
  outputPath: string;
}

/** ffmpeg drawtext text 이스케이프 (백슬래시·콜론·작은따옴표·퍼센트) */
function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/%/g, "\\%");
}

/** atempo는 0.5~2.0만 지원 → 범위 밖 배속은 체인으로 분해 */
function atempoChain(speed: number): string[] {
  const parts: number[] = [];
  let s = speed;
  while (s > 2) {
    parts.push(2);
    s /= 2;
  }
  while (s < 0.5) {
    parts.push(0.5);
    s *= 2;
  }
  parts.push(Number(s.toFixed(6)));
  return parts.map((p) => `atempo=${p}`);
}

function drawtextFilter(text: string, style: CueSheet["subtitleStyle"]): string {
  const t = escapeDrawtext(text);
  const base =
    `drawtext=text='${t}':fontsize=${style.size}:fontcolor=${style.color}` +
    `:borderw=${style.outlineWidth}:bordercolor=${style.outlineColor}:font='${style.font}'`;
  const x = "(w-text_w)/2";
  let y: string;
  switch (style.position) {
    case "top":
      y = "40";
      break;
    case "center":
      y = "(h-text_h)/2";
      break;
    default:
      y = "h-text_h-40"; // bottom
  }
  return `${base}:x=${x}:y=${y}`;
}

/**
 * 큐시트를 ffmpeg 렌더 계획(명령 인자)으로 변환한다.
 * 각 세그먼트를 트림→배속→스케일→fps 정규화→자막(있으면)한 뒤 concat으로 이어 붙이고,
 * bgm이 있으면 시작 시각(adelay)·볼륨을 적용해 amix로 섞는다.
 *
 * 단위는 초. clip 경로는 clipDir + 파일명으로 조립(폴더 이동에 안 깨지게).
 */
export function buildRenderPlan(cue: CueSheet, outputPath: string): RenderPlan {
  const { width: W, height: H, fps } = cue.project;
  const inputs: string[] = [];
  const filters: string[] = [];
  // concat 필터는 세그먼트별 [v][a]가 번갈아 나와야 한다: [v0][a0][v1][a1]...
  const concatLabels: string[] = [];
  let clipCount = 0;
  let idx = 0;

  function addClip(
    path: string,
    o: { ss?: number; dur?: number; speed?: number; volume?: number; subtitle?: string },
  ): void {
    if (o.ss != null) inputs.push("-ss", String(o.ss));
    if (o.dur != null) inputs.push("-t", String(o.dur));
    inputs.push("-i", path);
    const i = idx++;
    const speed = o.speed ?? 1;
    const vol = o.volume ?? 1;

    const vParts = ["setpts=PTS-STARTPTS"];
    if (speed !== 1) vParts.push(`setpts=PTS/${speed}`);
    vParts.push(`scale=${W}:${H}`, `fps=${fps}`);
    if (o.subtitle && o.subtitle.length > 0) {
      vParts.push(drawtextFilter(o.subtitle, cue.subtitleStyle));
    }
    filters.push(`[${i}:v]${vParts.join(",")}[v${i}]`);

    const aParts = ["asetpts=PTS-STARTPTS"];
    if (speed !== 1) aParts.push(...atempoChain(speed));
    if (vol !== 1) aParts.push(`volume=${vol}`);
    filters.push(`[${i}:a]${aParts.join(",")}[a${i}]`);

    concatLabels.push(`[v${i}]`, `[a${i}]`);
    clipCount++;
  }

  if (cue.intro) addClip(cue.intro, {});
  // 세그먼트별 출력 타임라인 시작 시각(누적, 배속 반영) — 내레이션 오디오를 그 시각에 배치하기 위함.
  // v1 제약: intro 길이는 파일 프로빙 없이 알 수 없어 이 오프셋에 포함하지 않는다.
  let segmentOffset = 0;
  const narrationCues: { path: string; start: number }[] = [];
  for (const s of cue.segments) {
    addClip(join(cue.clipDir, s.clip), {
      ss: s.in,
      dur: s.out - s.in,
      speed: s.speed,
      volume: s.volume,
      subtitle: s.subtitle,
    });
    if (cue.narration?.enabled && s.narration) {
      narrationCues.push({ path: join(cue.narration.dir, s.narration), start: segmentOffset });
    }
    segmentOffset += (s.out - s.in) / s.speed;
  }
  if (cue.outro) addClip(cue.outro, {});

  const n = clipCount;
  filters.push(`${concatLabels.join("")}concat=n=${n}:v=1:a=1[vout][amain]`);

  const mixLabels: string[] = [];
  if (cue.bgm.length > 0) {
    for (const b of cue.bgm) {
      inputs.push("-i", b.file);
      const i = idx++;
      const delay = Math.round(b.start * 1000);
      const dur = b.end - b.start;
      filters.push(
        `[${i}:a]atrim=0:${dur},adelay=${delay}|${delay},volume=${b.volume}[bgm${i}]`,
      );
      mixLabels.push(`[bgm${i}]`);
    }
  }
  if (narrationCues.length > 0 && cue.narration) {
    const narrationVolume = cue.narration.volume;
    for (const nCue of narrationCues) {
      inputs.push("-i", nCue.path);
      const i = idx++;
      const delay = Math.round(nCue.start * 1000);
      filters.push(`[${i}:a]adelay=${delay}|${delay},volume=${narrationVolume}[nar${i}]`);
      mixLabels.push(`[nar${i}]`);
    }
  }

  let finalAudio = "[amain]";
  if (mixLabels.length > 0) {
    filters.push(
      `[amain]${mixLabels.join("")}amix=inputs=${1 + mixLabels.length}:duration=first[aout]`,
    );
    finalAudio = "[aout]";
  }

  const filterComplex = filters.join(";");
  const args = [
    ...inputs,
    "-filter_complex",
    filterComplex,
    "-map",
    "[vout]",
    "-map",
    finalAudio,
    "-r",
    String(fps),
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-y",
    outputPath,
  ];
  return { args, filterComplex, outputPath };
}
