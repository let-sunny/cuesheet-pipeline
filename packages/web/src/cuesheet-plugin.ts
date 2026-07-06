import { readFile, writeFile, stat, mkdir, rename, readdir } from "node:fs/promises";
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
        needsGenerate = false;
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
    if (code === 0) {
      try {
        await rename(target.tmpPath, target.proxyPath);
      } catch (e) {
        console.error(`프록시 파일 이동 실패: ${basename(target.src)}`, e);
      }
    } else {
      console.error(`프록시 생성 실패, 원본으로 계속 서빙합니다: ${basename(target.src)}\n${stderr.slice(-500)}`);
    }
  }
  proxyQueueState = { pending: [], generating: null };
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
