import { readFile, writeFile, stat, mkdir, rename, readdir } from "node:fs/promises";
import { createReadStream, existsSync, watch, type FSWatcher } from "node:fs";
import { spawn } from "node:child_process";
import { basename, dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { validateCueSheet } from "@cuesheet/schema";
import { buildRenderPlan } from "@cuesheet/render";

const here = dirname(fileURLToPath(import.meta.url));
// src -> web -> packages -> 저장소 루트
const repoRoot = resolve(here, "../../..");
const renderOutputPath = resolve(repoRoot, "out.mp4");
// 4K HEVC 등 브라우저가 재생 못 하는 원본을 위한 720p H.264 미리보기 프록시 저장 위치.
const proxyDir = resolve(repoRoot, "media/proxies");

function cuesheetPath(): string {
  return process.env.CUESHEET_PATH ?? resolve(repoRoot, "project.cuesheet.json");
}

// 렌더가 진행 중일 때 동시 요청을 막기 위한 최소한의 플래그(큐잉 없음).
let renderInProgress = false;

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

  const total = targets.length;
  for (let i = 0; i < targets.length; i += 1) {
    const target = targets[i]!;
    log(`프록시 생성 중 (${i + 1}/${total}): ${basename(target.src)}`);
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

        renderInProgress = true;
        try {
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

          const plan = buildRenderPlan(result.data, renderOutputPath);
          const { code, stderr } = await runFfmpeg(plan.args);
          if (code === 0) {
            sendJson(res, 200, { ok: true, path: "out.mp4" });
          } else {
            const summary = stderr.slice(-2000);
            sendJson(res, 500, { ok: false, error: summary });
          }
        } finally {
          renderInProgress = false;
        }
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
