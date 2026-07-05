import { execFile } from "node:child_process";
import { mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

/**
 * scan 단계: 원본 폴더 인벤토리 + 비전 판단용 프레임 추출.
 * 산출물(manifest.json)을 Claude가 프레임을 직접 보고 moments.json으로 옮긴다.
 */

const execFileAsync = promisify(execFile);

const VIDEO_EXT = /\.(mp4|mov)$/i;
const FFPROBE_TIMEOUT_MS = 15_000;
const FFMPEG_TIMEOUT_MS = 15_000;

export interface FrameRef {
  t: number;
  path: string;
}

export interface ClipManifest {
  name: string;
  durS: number;
  interval: number;
  frames: FrameRef[];
}

export interface Manifest {
  clips: ClipManifest[];
  evicted: string[];
}

/** 클립 길이(초)에 따른 프레임 추출 간격(초). 길수록 성기게. */
export function intervalFor(durS: number): number {
  if (durS < 15) return 2;
  if (durS < 60) return 5;
  if (durS < 300) return 15;
  return 60;
}

/**
 * iCloud 미다운로드(placeholder) 파일 여부. blocks===0이면 로컬 실물이 없는
 * 상태라 읽으면 다운로드를 기다리며 무한 정지한다 — 반드시 먼저 확인하고 건너뛴다.
 */
function isEvicted(path: string): boolean {
  return statSync(path).blocks === 0;
}

async function probeDuration(path: string): Promise<number> {
  const { stdout } = await execFileAsync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", path],
    { timeout: FFPROBE_TIMEOUT_MS },
  );
  return Number.parseFloat(stdout.trim());
}

/** t=0부터 interval 간격, 마지막은 영상 끝 1초 전으로 보정한 타임스탬프 목록. */
function timestampsFor(durS: number, interval: number): number[] {
  const ts: number[] = [];
  for (let t = 0; t < durS - 1; t += interval) ts.push(t);
  const last = Math.max(0, durS - 1);
  const lastPushed = ts[ts.length - 1];
  if (lastPushed === undefined || last - lastPushed > 0.5) ts.push(last);
  return ts;
}

/** ffmpeg 시크 기반(-ss를 -i 앞에) 640px 프레임 1장 추출. 실패/빈 파일이면 null. */
async function extractFrame(clipPath: string, t: number, outDir: string): Promise<string | null> {
  const filename = `t${String(Math.round(t)).padStart(5, "0")}.jpg`;
  const outPath = join(outDir, filename);
  try {
    await execFileAsync(
      "ffmpeg",
      ["-y", "-ss", String(t), "-i", clipPath, "-frames:v", "1", "-vf", "scale=640:-2", outPath],
      { timeout: FFMPEG_TIMEOUT_MS },
    );
  } catch {
    return null;
  }
  try {
    if (statSync(outPath).size === 0) return null;
  } catch {
    return null;
  }
  return outPath;
}

/**
 * 원본 폴더를 스캔한다: iCloud 미다운로드 클립은 건너뛰고, 로컬 실물만
 * ffprobe로 길이를 구한 뒤 길이별 간격으로 프레임을 추출한다.
 */
export async function scanFolder(srcDir: string, workDir: string): Promise<Manifest> {
  const names = readdirSync(srcDir)
    .filter((n) => VIDEO_EXT.test(n))
    .sort((a, b) => a.localeCompare(b));

  const evicted: string[] = [];
  const clips: ClipManifest[] = [];
  const framesRoot = join(workDir, "frames");

  for (const name of names) {
    const path = join(srcDir, name);
    if (isEvicted(path)) {
      evicted.push(name);
      continue;
    }

    const durS = await probeDuration(path);
    const interval = intervalFor(durS);
    const clipFramesDir = join(framesRoot, name.replace(VIDEO_EXT, ""));
    mkdirSync(clipFramesDir, { recursive: true });

    const frames: FrameRef[] = [];
    for (const t of timestampsFor(durS, interval)) {
      const framePath = await extractFrame(path, t, clipFramesDir);
      if (framePath) frames.push({ t, path: framePath });
    }

    clips.push({ name, durS, interval, frames });
  }

  return { clips, evicted };
}
