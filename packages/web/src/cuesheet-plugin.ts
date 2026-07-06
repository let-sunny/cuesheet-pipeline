import { readFile, writeFile, stat, mkdir, rename, readdir, rm } from "node:fs/promises";
import { createReadStream, existsSync, watch, type FSWatcher } from "node:fs";
import { spawn } from "node:child_process";
import { basename, dirname, extname, isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { validateCueSheet, type CueSheet } from "@cuesheet/schema";
import { buildRenderPlan } from "@cuesheet/render";

const here = dirname(fileURLToPath(import.meta.url));
// src -> web -> packages -> 저장소 루트
const repoRoot = resolve(here, "../../..");
const renderOutputPath = resolve(repoRoot, "out.mp4");
// 4K HEVC 등 브라우저가 재생 못 하는 원본을 위한 720p H.264 미리보기 프록시 저장 위치.
const proxyDir = resolve(repoRoot, "media/proxies");
// 순간 팔레트: 초벌 분류 데이터와 썸네일용 프레임이 저장된 위치.
const draftsRoot = resolve(repoRoot, "media/drafts");
const framesRoot = resolve(draftsRoot, "frames");
// 세그먼트 썸네일(편집 스텝 컷 리스트/미니 타임라인용) 시크 추출 결과 디스크 캐시.
const thumbsDir = resolve(repoRoot, "media/.thumbs");

function cuesheetPath(): string {
  return process.env.CUESHEET_PATH ?? resolve(repoRoot, "project.cuesheet.json");
}

function momentsPath(): string {
  return process.env.MOMENTS_PATH ?? resolve(draftsRoot, "dotmix.moments.json");
}

/** target이 root 안(root 자신 포함)에 있는지 확인 — 경로 탈출 방지. */
function isWithin(root: string, target: string): boolean {
  return target === root || target.startsWith(root + sep);
}

// 렌더가 진행 중일 때 동시 요청을 막기 위한 최소한의 플래그(큐잉 없음).
let renderInProgress = false;

interface RenderJobState {
  state: "idle" | "running" | "done" | "error";
  progress: number;
  error?: string;
}

// 마지막(또는 진행 중) 렌더 잡의 상태. 잡은 한 번에 하나만 존재하므로 별도 저장소 없이
// 모듈 스코프 변수 하나로 충분하다(이력 관리는 범위 밖).
let renderJob: RenderJobState = { state: "idle", progress: 0 };
let renderJobCounter = 0;

// ffmpeg stderr 한 줄에서 "time=HH:MM:SS.ms"를 초 단위로 파싱한다.
function parseFfmpegTimeSeconds(text: string): number | null {
  const m = text.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) {
    return null;
  }
  const [, hh, mm, ss] = m as unknown as [string, string, string, string];
  return Number(hh) * 3600 + Number(mm) * 60 + Number(ss);
}

/**
 * 진행률 계산용 총 출력 길이(초) 근사치.
 * 세그먼트 (out-in)/speed 합만 쓰고 intro/outro는 파일 프로빙 없이 알 수 없어 무시한다
 * (진행률 표시용 근사치이므로 실제 렌더 결과 길이와는 약간 다를 수 있다).
 */
function estimateOutputSeconds(cue: CueSheet): number {
  return cue.segments.reduce((sum, s) => sum + (s.out - s.in) / s.speed, 0);
}

/** 초 단위 시각을 SRT 타임스탬프(HH:MM:SS,mmm)로 포맷한다. */
function secondsToSrtTimestamp(totalSeconds: number): string {
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
 */
function buildSrt(cue: CueSheet): string {
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

function runFfmpeg(args: string[]): Promise<{ code: number | null; stderr: string }> {
  return new Promise((res) => {
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stdout?.on("data", () => {});
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    proc.on("error", (e) => {
      res({ code: null, stderr: `ffmpeg 실행 실패(설치되어 있나요?): ${e.message}` });
    });
    proc.on("exit", (code) => {
      res({ code, stderr });
    });
  });
}

/** ffprobe로 duration을 읽는다. 실패(파싱 불가/0 이하/프로세스 에러)하면 null. */
function probeDurationSeconds(path: string): Promise<number | null> {
  return new Promise((res) => {
    const proc = spawn(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", path],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    proc.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    proc.on("error", () => res(null));
    proc.on("exit", (code) => {
      if (code !== 0) {
        res(null);
        return;
      }
      const duration = Number(stdout.trim());
      res(Number.isFinite(duration) && duration > 0 ? duration : null);
    });
  });
}

/**
 * 트랙 데이터 없이 moov만 있는 등 손상된 비디오 파일을 걸러낸다.
 * duration만 보면 통과하지만 실제로는 스트림 중간(NAL 오류 등)이 깨져 시크가
 * 안 되는 실사례가 있었다 — duration 체크에 더해 파일 뒷부분(70% 지점)을 2초
 * 시크+디코드해 exit 0이고 stderr가 비어 있는지까지 확인한다(디코드 검증).
 * 이 함수는 항상 백그라운드(generateProxies, 서버 시작을 막지 않음)에서만 호출된다.
 */
async function isValidVideoFile(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    if (s.size === 0) {
      return false;
    }
  } catch {
    return false;
  }
  const duration = await probeDurationSeconds(path);
  if (duration === null) {
    return false;
  }
  // "-v error"는 실측 결과 뒷부분이 통째로 잘려나가 디코드 결과가 0프레임인 경우에도
  // (ffmpeg가 이를 error가 아닌 warning 레벨로만 남김 — "Output file is empty" 등)
  // 조용히 exit 0을 반환해 손상을 놓친다. "-v warning"으로 올려야 이 경고가 stderr에 잡힌다.
  const { code, stderr } = await runFfmpeg([
    "-v",
    "warning",
    "-ss",
    String(duration * 0.7),
    "-t",
    "2",
    "-i",
    path,
    "-f",
    "null",
    "-",
  ]);
  return code === 0 && stderr.trim() === "";
}

const clipMimeTypes: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".m4v": "video/x-m4v",
};

function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((res, rej) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString("utf8");
    });
    req.on("end", () => res(body));
    req.on("error", rej);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

// 프록시 파일명은 원본 파일명에서 확장자만 .mp4로 통일한다.
function proxyFileName(originalName: string): string {
  return `${basename(originalName, extname(originalName))}.mp4`;
}

interface ProxyQueueState {
  /** 아직 처리 시작 전인 원본 클립 파일명(대기 순서대로). */
  pending: string[];
  /** 지금 프록시 생성 중인 원본 클립 파일명, 없으면 null. */
  generating: string | null;
}

// 프록시 생성 큐 상태 — GET /api/proxy-status로 노출해 편집 화면에서
// "프록시 준비 중" 안내를 띄우는 데 쓴다.
let proxyQueueState: ProxyQueueState = { pending: [], generating: null };

/**
 * clipDir 안의 로컬 실물 영상 파일들에 대해 720p H.264 미리보기 프록시가
 * 없거나 원본보다 오래됐으면 순차적으로(한 번에 하나씩) 생성한다.
 * 서버 시작을 블로킹하지 않도록 호출부에서 await 없이 백그라운드로 실행한다.
 */
async function generateProxies(clipDir: string, log: (msg: string) => void): Promise<void> {
  await mkdir(proxyDir, { recursive: true });

  let entries: string[];
  try {
    entries = await readdir(clipDir);
  } catch {
    return;
  }

  const videoFiles = entries.filter((name) => clipMimeTypes[extname(name).toLowerCase()] !== undefined);

  const targets: { src: string; proxyPath: string; tmpPath: string }[] = [];
  for (const name of videoFiles) {
    const srcPath = resolve(clipDir, name);
    let srcStat;
    try {
      srcStat = await stat(srcPath);
    } catch {
      continue;
    }
    if (srcStat.blocks === 0) {
      // iCloud 등 클라우드 전용 placeholder는 읽으면 무한 정지하므로 건너뛴다.
      continue;
    }

    const proxyPath = resolve(proxyDir, proxyFileName(name));
    let needsGenerate = true;
    try {
      const proxyStat = await stat(proxyPath);
      if (proxyStat.mtimeMs >= srcStat.mtimeMs) {
        // 기존 프록시도 가볍게 무결성 검사 — 이전 실행이 중간에 죽어 moov는 있는데
        // 트랙 데이터가 없는 등 손상된 파일이면 재생성 큐에 다시 넣는다.
        needsGenerate = !(await isValidVideoFile(proxyPath));
      }
    } catch {
      // 프록시가 아직 없음 -> 생성 필요
    }
    if (needsGenerate) {
      targets.push({ src: srcPath, proxyPath, tmpPath: `${proxyPath}.tmp` });
    }
  }

  proxyQueueState = { pending: targets.map((t) => basename(t.src)), generating: null };

  const total = targets.length;
  for (let i = 0; i < targets.length; i += 1) {
    const target = targets[i]!;
    const name = basename(target.src);
    proxyQueueState = { pending: targets.slice(i + 1).map((t) => basename(t.src)), generating: name };
    log(`프록시 생성 중 (${i + 1}/${total}): ${name}`);

    // 최대 2회 시도: 생성 후(rename 전) ffprobe로 duration을 검증해 손상 파일이면
    // 지우고 재시도, 두 번째도 손상이면 로그만 남기고 건너뛴다(원본으로 폴백 서빙).
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const { code, stderr } = await runFfmpeg([
        "-y",
        "-i",
        target.src,
        "-vf",
        "scale=1280:-2",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "26",
        "-g",
        "30",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "96k",
        "-movflags",
        "+faststart",
        "-f",
        "mp4",
        target.tmpPath,
      ]);
      if (code !== 0) {
        console.error(`프록시 생성 실패, 원본으로 계속 서빙합니다: ${name}\n${stderr.slice(-500)}`);
        break;
      }
      if (!(await isValidVideoFile(target.tmpPath))) {
        await rm(target.tmpPath, { force: true }).catch(() => {});
        if (attempt < 2) {
          console.error(`프록시 생성 결과가 손상됨, 재시도합니다 (${attempt}/2): ${name}`);
          continue;
        }
        console.error(`프록시 생성 결과가 재시도 후에도 손상됨, 건너뜁니다: ${name}`);
        break;
      }
      try {
        await rename(target.tmpPath, target.proxyPath);
      } catch (e) {
        console.error(`프록시 파일 이동 실패: ${name}`, e);
      }
      break;
    }
  }
  proxyQueueState = { pending: [], generating: null };
}

// 같은 (클립, 시각) 썸네일 요청이 겹칠 때 ffmpeg를 중복 실행하지 않도록 하는 dedup 맵.
const thumbInFlight = new Map<string, Promise<boolean>>();

// 썸네일 ffmpeg 동시 실행 최대 2개 — 초과 요청은 큐에서 직렬 대기한다.
let thumbActiveCount = 0;
const thumbWaitQueue: (() => void)[] = [];

async function acquireThumbSlot(): Promise<void> {
  if (thumbActiveCount >= 2) {
    await new Promise<void>((res) => thumbWaitQueue.push(res));
  }
  thumbActiveCount += 1;
}

function releaseThumbSlot(): void {
  thumbActiveCount -= 1;
  const next = thumbWaitQueue.shift();
  next?.();
}

/** 프록시에서 t초 지점 프레임 하나를 시크 추출해 cachePath에 저장한다. */
async function generateThumbnail(proxyPath: string, t: number, cachePath: string): Promise<boolean> {
  await acquireThumbSlot();
  try {
    const tmpPath = `${cachePath}.tmp`;
    const { code } = await runFfmpeg([
      "-ss",
      String(t),
      "-i",
      proxyPath,
      "-frames:v",
      "1",
      "-vf",
      "scale=160:-2",
      // tmpPath는 원자적 쓰기를 위해 ".tmp"가 붙어 확장자로 포맷을 못 알아채므로 명시한다.
      "-f",
      "mjpeg",
      "-y",
      tmpPath,
    ]);
    if (code !== 0) {
      return false;
    }
    await rename(tmpPath, cachePath);
    return true;
  } catch {
    return false;
  } finally {
    releaseThumbSlot();
  }
}

/** key(클립스템_반올림시각)로 dedup하며 캐시에 없으면 생성한다. */
async function getOrGenerateThumb(
  key: string,
  proxyPath: string,
  t: number,
  cachePath: string,
): Promise<boolean> {
  let promise = thumbInFlight.get(key);
  if (!promise) {
    promise = generateThumbnail(proxyPath, t, cachePath).finally(() => {
      thumbInFlight.delete(key);
    });
    thumbInFlight.set(key, promise);
  }
  return promise;
}

/**
 * 개발 서버에 큐시트 파일을 서빙/저장하는 미들웨어,
 * 클립을 정적 서빙하는 미들웨어, 파일 변경을 감지해 클라이언트로
 * 알리는 HMR 커스텀 이벤트를 붙인다.
 */
export function cuesheetPlugin(): Plugin {
  return {
    name: "cuesheet-plugin",
    configureServer(server) {
      const filePath = cuesheetPath();
      // 서버가 직접 쓴 마지막 내용. fs.watch 콜백에서 이 값과 같으면
      // 자기 저장으로 인한 이벤트이므로 클라이언트에 알리지 않는다.
      let lastWrittenContent: string | null = null;

      // 서버 시작을 블로킹하지 않도록 프록시 생성은 백그라운드로 돌린다.
      void (async () => {
        let clipDir: string;
        try {
          const raw = await readFile(filePath, "utf8");
          const cuesheet = JSON.parse(raw) as { clipDir?: unknown };
          if (typeof cuesheet.clipDir !== "string" || cuesheet.clipDir.length === 0) {
            return;
          }
          clipDir = cuesheet.clipDir;
        } catch {
          return;
        }
        await generateProxies(clipDir, (msg) => server.config.logger.info(msg));
      })();

      server.middlewares.use("/api/cuesheet", async (req, res) => {
        if (req.method === "GET") {
          try {
            const json = await readFile(filePath, "utf8");
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(json);
          } catch {
            res.statusCode = 404;
            res.setHeader("Content-Type", "text/plain; charset=utf-8");
            res.end(`큐시트 파일을 찾을 수 없습니다: ${filePath}`);
          }
          return;
        }

        if (req.method === "POST" || req.method === "PUT") {
          let parsed: unknown;
          try {
            const body = await readRequestBody(req);
            parsed = JSON.parse(body);
          } catch {
            sendJson(res, 400, {
              ok: false,
              errors: ["(root): 요청 본문이 올바른 JSON이 아닙니다"],
            });
            return;
          }

          const result = validateCueSheet(parsed);
          if (!result.ok) {
            sendJson(res, 400, { ok: false, errors: result.errors });
            return;
          }

          const content = `${JSON.stringify(result.data, null, 2)}\n`;
          lastWrittenContent = content;
          await writeFile(filePath, content, "utf8");
          sendJson(res, 200, { ok: true, data: result.data });
          return;
        }

        res.statusCode = 405;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end("허용되지 않는 메서드입니다");
      });

      server.middlewares.use("/clips", async (req, res) => {
        // 프록시가 밤사이 손상본 -> 재생성본으로 바뀌는 경우가 있어, 브라우저가 캐시된
        // 손상 영상을 계속 쓰지 않도록 매 요청 재검증을 강제한다(200/206/에러 응답 전부).
        res.setHeader("Cache-Control", "no-cache");
        const [rawPath = "", rawQuery = ""] = (req.url ?? "").split("?");
        const decoded = decodeURIComponent(rawPath.replace(/^\/+/, ""));
        if (!decoded || decoded !== basename(decoded)) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("잘못된 파일명입니다");
          return;
        }
        // ?original=1 이면 프록시가 있어도 항상 원본을 서빙한다(렌더 검증용 escape hatch).
        const forceOriginal = new URLSearchParams(rawQuery).get("original") === "1";

        let clipDir: string;
        try {
          const raw = await readFile(filePath, "utf8");
          const cuesheet = JSON.parse(raw) as { clipDir?: unknown };
          if (typeof cuesheet.clipDir !== "string" || cuesheet.clipDir.length === 0) {
            throw new Error("clipDir 없음");
          }
          clipDir = cuesheet.clipDir;
        } catch {
          res.statusCode = 404;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("클립을 찾을 수 없습니다");
          return;
        }

        const originalPath = resolve(clipDir, decoded);
        const proxyPath = resolve(proxyDir, proxyFileName(decoded));

        let clipPath: string;
        if (!forceOriginal && existsSync(proxyPath)) {
          clipPath = proxyPath;
        } else if (existsSync(originalPath)) {
          clipPath = originalPath;
        } else {
          res.statusCode = 404;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("클립을 찾을 수 없습니다");
          return;
        }

        const mime = clipMimeTypes[extname(clipPath).toLowerCase()] ?? "application/octet-stream";
        res.setHeader("Content-Type", mime);
        res.setHeader("Accept-Ranges", "bytes");

        const stats = await stat(clipPath);
        const total = stats.size;

        const rangeHeader = req.headers.range;
        if (!rangeHeader) {
          res.statusCode = 200;
          res.setHeader("Content-Length", String(total));
          createReadStream(clipPath).pipe(res);
          return;
        }

        // 멀티 레인지는 지원하지 않고 첫 레인지만 처리한다.
        const firstRange = rangeHeader.replace(/^bytes=/, "").split(",")[0] ?? "";
        const [startStr, endStr] = firstRange.split("-");
        const start = startStr ? parseInt(startStr, 10) : 0;
        const end = endStr ? parseInt(endStr, 10) : total - 1;

        if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= total) {
          res.statusCode = 416;
          res.setHeader("Content-Range", `bytes */${total}`);
          res.end();
          return;
        }

        const safeEnd = Math.min(end, total - 1);
        res.statusCode = 206;
        res.setHeader("Content-Range", `bytes ${start}-${safeEnd}/${total}`);
        res.setHeader("Content-Length", String(safeEnd - start + 1));
        createReadStream(clipPath, { start, end: safeEnd }).pipe(res);
      });

      // intro/outro는 clipDir와 무관한 독립 파일 경로라 /clips가 아닌 별도 경로로 서빙한다.
      // 상대 경로면 저장소 루트 기준으로 해석한다. 읽기 전용 GET만 허용.
      server.middlewares.use("/api/local-video", async (req, res) => {
        if (req.method !== "GET") {
          res.statusCode = 405;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("허용되지 않는 메서드입니다");
          return;
        }
        const rawQuery = (req.url ?? "").split("?")[1] ?? "";
        const requestedPath = new URLSearchParams(rawQuery).get("path");
        if (!requestedPath) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("path 쿼리가 필요합니다");
          return;
        }
        const mime = clipMimeTypes[extname(requestedPath).toLowerCase()];
        const targetPath = isAbsolute(requestedPath) ? requestedPath : resolve(repoRoot, requestedPath);
        if (!mime || !existsSync(targetPath)) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("파일을 찾을 수 없습니다");
          return;
        }

        res.setHeader("Content-Type", mime);
        res.setHeader("Accept-Ranges", "bytes");

        const stats = await stat(targetPath);
        const total = stats.size;

        const rangeHeader = req.headers.range;
        if (!rangeHeader) {
          res.statusCode = 200;
          res.setHeader("Content-Length", String(total));
          createReadStream(targetPath).pipe(res);
          return;
        }

        const firstRange = rangeHeader.replace(/^bytes=/, "").split(",")[0] ?? "";
        const [startStr, endStr] = firstRange.split("-");
        const start = startStr ? parseInt(startStr, 10) : 0;
        const end = endStr ? parseInt(endStr, 10) : total - 1;

        if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= total) {
          res.statusCode = 416;
          res.setHeader("Content-Range", `bytes */${total}`);
          res.end();
          return;
        }

        const safeEnd = Math.min(end, total - 1);
        res.statusCode = 206;
        res.setHeader("Content-Range", `bytes ${start}-${safeEnd}/${total}`);
        res.setHeader("Content-Length", String(safeEnd - start + 1));
        createReadStream(targetPath, { start, end: safeEnd }).pipe(res);
      });

      // 디스크에 저장된 큐시트 기준으로 SRT 자막 파일을 생성해 내려준다(유튜브 CC 트랙용).
      server.middlewares.use("/api/subtitles.srt", async (req, res) => {
        if (req.method !== "GET") {
          res.statusCode = 405;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("허용되지 않는 메서드입니다");
          return;
        }

        let parsed: unknown;
        try {
          const raw = await readFile(filePath, "utf8");
          parsed = JSON.parse(raw);
        } catch {
          res.statusCode = 404;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("큐시트 파일을 찾을 수 없습니다");
          return;
        }

        const result = validateCueSheet(parsed);
        if (!result.ok) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end(result.errors.join("\n"));
          return;
        }

        const srt = buildSrt(result.data);
        const fileName = `${result.data.project.name}.srt`;
        res.setHeader("Content-Type", "application/x-subrip; charset=utf-8");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="subtitles.srt"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        );
        res.end(srt, "utf8");
      });

      // 라우팅 순서 주의: "/api/render/status"가 "/api/render"의 접두사 매칭에 앞서
      // 먼저 처리되도록 반드시 "/api/render"보다 먼저 등록한다.
      server.middlewares.use("/api/render/status", (req, res) => {
        if (req.method !== "GET") {
          res.statusCode = 405;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("허용되지 않는 메서드입니다");
          return;
        }
        sendJson(res, 200, {
          state: renderJob.state,
          progress: renderJob.progress,
          error: renderJob.error,
          outputReady: renderJob.state === "done" && existsSync(renderOutputPath),
        });
      });

      server.middlewares.use("/api/render", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("허용되지 않는 메서드입니다");
          return;
        }

        if (renderInProgress) {
          sendJson(res, 409, { ok: false, error: "이미 렌더가 진행 중입니다" });
          return;
        }

        let parsed: unknown;
        try {
          const raw = await readFile(filePath, "utf8");
          parsed = JSON.parse(raw);
        } catch {
          sendJson(res, 400, {
            ok: false,
            error: "(root): 큐시트 파일을 읽거나 파싱할 수 없습니다",
          });
          return;
        }

        const result = validateCueSheet(parsed);
        if (!result.ok) {
          sendJson(res, 400, { ok: false, error: result.errors.join("\n") });
          return;
        }

        // 검증 통과 즉시 jobId를 응답하고, ffmpeg는 백그라운드로 돌리며 진행률만
        // renderJob에 갱신한다(응답을 기다리게 하지 않음 — 렌더 수 분 동안 블로킹 방지).
        renderInProgress = true;
        renderJobCounter += 1;
        const jobId = String(renderJobCounter);
        const totalSeconds = estimateOutputSeconds(result.data);
        renderJob = { state: "running", progress: 0 };

        const plan = buildRenderPlan(result.data, renderOutputPath);
        const proc = spawn("ffmpeg", plan.args, { stdio: ["ignore", "pipe", "pipe"] });
        let stderr = "";
        proc.stdout?.on("data", () => {});
        proc.stderr?.on("data", (chunk: Buffer) => {
          const text = chunk.toString("utf8");
          stderr += text;
          const seconds = parseFfmpegTimeSeconds(text);
          if (seconds != null && totalSeconds > 0) {
            const pct = Math.min(99, Math.round((seconds / totalSeconds) * 100));
            renderJob = { state: "running", progress: pct };
          }
        });
        proc.on("error", (e) => {
          renderInProgress = false;
          renderJob = {
            state: "error",
            progress: renderJob.progress,
            error: `ffmpeg 실행 실패(설치되어 있나요?): ${e.message}`,
          };
        });
        proc.on("exit", (code) => {
          renderInProgress = false;
          if (code === 0) {
            renderJob = { state: "done", progress: 100 };
          } else {
            renderJob = { state: "error", progress: renderJob.progress, error: stderr.slice(-2000) };
          }
        });

        sendJson(res, 200, { ok: true, jobId });
      });

      server.middlewares.use("/api/proxy-status", (req, res) => {
        if (req.method !== "GET") {
          res.statusCode = 405;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("허용되지 않는 메서드입니다");
          return;
        }
        sendJson(res, 200, proxyQueueState);
      });

      server.middlewares.use("/api/moments", async (req, res) => {
        if (req.method !== "GET") {
          res.statusCode = 405;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("허용되지 않는 메서드입니다");
          return;
        }
        const p = momentsPath();
        try {
          const json = await readFile(p, "utf8");
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(json);
        } catch {
          res.statusCode = 404;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end(`순간 데이터 파일을 찾을 수 없습니다: ${p}`);
        }
      });

      // 클립별 썸네일 프레임 정적 서빙. /draft-frames/<클립폴더>/<파일명>.jpg
      server.middlewares.use("/draft-frames", async (req, res) => {
        if (req.method !== "GET") {
          res.statusCode = 405;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("허용되지 않는 메서드입니다");
          return;
        }
        const rawPath = decodeURIComponent(
          (req.url ?? "").split("?")[0]?.replace(/^\/+/, "") ?? "",
        );
        const target = resolve(framesRoot, rawPath);
        if (!rawPath || !isWithin(framesRoot, target) || extname(target).toLowerCase() !== ".jpg") {
          res.statusCode = 400;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("잘못된 경로입니다");
          return;
        }
        if (!existsSync(target)) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("프레임을 찾을 수 없습니다");
          return;
        }
        res.setHeader("Content-Type", "image/jpeg");
        createReadStream(target).pipe(res);
      });

      // 클립 폴더 안 프레임 파일 목록 — inS에 가장 가까운 프레임을 클라이언트가 고를 수 있게 한다.
      server.middlewares.use("/api/draft-frames", async (req, res) => {
        if (req.method !== "GET") {
          res.statusCode = 405;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("허용되지 않는 메서드입니다");
          return;
        }
        const folder = decodeURIComponent(
          (req.url ?? "").split("?")[0]?.replace(/^\/+/, "") ?? "",
        );
        const target = resolve(framesRoot, folder);
        if (!folder || folder.includes("/") || !isWithin(framesRoot, target)) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("잘못된 클립 폴더입니다");
          return;
        }
        let entries: string[];
        try {
          entries = await readdir(target);
        } catch {
          sendJson(res, 404, []);
          return;
        }
        const files = entries.filter((f) => extname(f).toLowerCase() === ".jpg");
        sendJson(res, 200, files);
      });

      // 세그먼트 썸네일: /api/thumb?clip=<원본 파일명>&t=<초> — 프록시에서 해당 시각
      // 프레임을 시크 추출해 jpg로 반환한다. 프록시가 없으면 404(클라이언트가 자리비움
      // placeholder를 그린다). 캐시 키는 t를 0.5초 단위로 반올림해 드래그 중 미세하게
      // 다른 t로 인한 캐시 미스/중복 생성을 줄인다.
      server.middlewares.use("/api/thumb", async (req, res) => {
        // /clips와 동일한 이유로 재검증을 강제한다 — 썸네일도 프록시에서 시크 추출한
        // 결과라 프록시가 재생성되면 예전 프레임을 계속 보여줄 수 있다.
        res.setHeader("Cache-Control", "no-cache");
        if (req.method !== "GET") {
          res.statusCode = 405;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("허용되지 않는 메서드입니다");
          return;
        }
        const rawQuery = (req.url ?? "").split("?")[1] ?? "";
        const params = new URLSearchParams(rawQuery);
        const clipParam = params.get("clip") ?? "";
        const tParam = params.get("t");
        const t = tParam !== null ? Number(tParam) : NaN;
        if (!clipParam || clipParam !== basename(clipParam) || !Number.isFinite(t) || t < 0) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("잘못된 요청입니다");
          return;
        }

        const roundedT = Math.round(t * 2) / 2;
        const clipStem = basename(clipParam, extname(clipParam));
        const cacheFileName = `${clipStem}_${roundedT}.jpg`;
        const cachePath = resolve(thumbsDir, cacheFileName);

        if (existsSync(cachePath)) {
          res.setHeader("Content-Type", "image/jpeg");
          createReadStream(cachePath).pipe(res);
          return;
        }

        const proxyPath = resolve(proxyDir, proxyFileName(clipParam));
        if (!existsSync(proxyPath)) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("프록시가 없어 썸네일을 만들 수 없습니다");
          return;
        }

        await mkdir(thumbsDir, { recursive: true });
        const ok = await getOrGenerateThumb(cacheFileName, proxyPath, roundedT, cachePath);
        if (!ok || !existsSync(cachePath)) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("썸네일 생성 실패");
          return;
        }

        res.setHeader("Content-Type", "image/jpeg");
        createReadStream(cachePath).pipe(res);
      });

      server.middlewares.use("/out.mp4", (req, res) => {
        if (req.method !== "GET") {
          res.statusCode = 405;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("허용되지 않는 메서드입니다");
          return;
        }

        if (!existsSync(renderOutputPath)) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("렌더 결과물을 찾을 수 없습니다");
          return;
        }

        res.setHeader("Content-Type", "video/mp4");
        res.setHeader("Content-Disposition", "attachment; filename=out.mp4");
        createReadStream(renderOutputPath).pipe(res);
      });

      let watcher: FSWatcher | null = null;
      if (existsSync(filePath)) {
        watcher = watch(filePath, () => {
          void (async () => {
            let current: string;
            try {
              current = await readFile(filePath, "utf8");
            } catch {
              return;
            }
            if (current === lastWrittenContent) {
              // 방금 이 서버가 저장한 결과이므로 외부 변경 알림을 보내지 않는다.
              return;
            }
            server.ws.send({ type: "custom", event: "cuesheet:changed" });
          })();
        });
        server.httpServer?.once("close", () => watcher?.close());
      }
    },
  };
}
