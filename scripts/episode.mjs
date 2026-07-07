#!/usr/bin/env node
/**
 * pnpm episode <원본폴더> [--scan-only] [--no-open] [--rescan]
 *
 * 에피소드 시작의 "기계 부분"을 한 줄로 처리한다:
 *   1) 원본 폴더 검증(존재/영상 파일/iCloud 미다운로드 개수 보고)
 *   2) cuesheet-draft scan 실행 -> media/drafts/<슬러그>/manifest.json
 *   3) 웹 에디터 서버 보장(이미 떠 있으면 유지 안내만) + 브라우저 오픈
 *   4) 다음 단계 안내: Claude Code에서 /episode <원본폴더>
 *
 * 비전 판독(moments.json 작성)/조립/자막 작성은 Claude Code(/episode 커스텀 커맨드)의 몫이다.
 * 이 스크립트는 그 앞뒤의 기계적 작업만 한다.
 */
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { spawnSync, spawn } from "node:child_process";
import { createConnection } from "node:net";
import { basename, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const WEB_PORT = 5173;
const VIDEO_EXTS = new Set([".mp4", ".mov", ".mkv", ".m4v", ".webm"]);

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (const a of argv) {
    if (a.startsWith("--")) {
      flags[a.slice(2)] = true;
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

/** 폴더명을 파일시스템/URL에 안전한 슬러그로 변환한다(한글은 유지). */
function slugify(name) {
  const slug = name
    .trim()
    .replace(/[^\p{L}\p{N}_-]+/gu, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "episode";
}

function isPortOpen(port) {
  return new Promise((res) => {
    // host는 "localhost"로 둔다 - Vite 기본 바인딩이 이 머신에서 IPv6([::1])로만
    // 잡히는 경우가 있어("127.0.0.1"로 고정하면 그 연결은 항상 실패), OS 리졸버가
    // 실제 바인딩과 같은 주소를 고르게 맡긴다.
    const socket = createConnection({ port, host: "localhost" });
    const done = (result) => {
      socket.destroy();
      res(result);
    };
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.setTimeout(500, () => done(false));
  });
}

async function waitForPort(port, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isPortOpen(port)) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

function ensureDraftBuilt() {
  const cliPath = resolve(repoRoot, "packages/draft/dist/cli.js");
  if (existsSync(cliPath)) {
    return cliPath;
  }
  console.log("cuesheet-draft가 빌드되어 있지 않아 먼저 빌드합니다...");
  const result = spawnSync("pnpm", ["--filter", "@cuesheet/draft", "build"], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    console.error("cuesheet-draft 빌드 실패");
    process.exit(result.status ?? 1);
  }
  return cliPath;
}

function openBrowser(url) {
  const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  spawn(opener, [url], { stdio: "ignore", detached: true }).unref();
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const srcArg = positional[0];
  if (!srcArg) {
    console.error("사용법: pnpm episode <원본폴더> [--scan-only] [--no-open] [--rescan]");
    process.exit(1);
  }

  const srcDir = resolve(srcArg);
  if (!existsSync(srcDir) || !statSync(srcDir).isDirectory()) {
    console.error(`폴더를 찾을 수 없습니다: ${srcDir}`);
    process.exit(1);
  }

  const entries = readdirSync(srcDir);
  const videoFiles = entries.filter((f) => VIDEO_EXTS.has(extname(f).toLowerCase()));
  if (videoFiles.length === 0) {
    console.error(`영상 파일이 없습니다: ${srcDir}`);
    process.exit(1);
  }

  const evictedCount = videoFiles.filter((f) => statSync(resolve(srcDir, f)).blocks === 0).length;
  console.log(
    `원본 폴더: ${srcDir} (영상 ${videoFiles.length}개, iCloud 미다운로드 ${evictedCount}개)`,
  );

  const slug = slugify(basename(srcDir));
  const draftDir = resolve(repoRoot, "media/drafts", slug);
  const episodesDir = resolve(repoRoot, "episodes");
  const cuesheetPath = resolve(episodesDir, `${slug}.cuesheet.json`);
  mkdirSync(episodesDir, { recursive: true });

  const manifestPath = resolve(draftDir, "manifest.json");
  if (existsSync(manifestPath) && !flags.rescan) {
    console.log(`이미 스캔됨, 건너뜁니다: ${manifestPath} (다시 스캔하려면 --rescan)`);
  } else {
    const cliPath = ensureDraftBuilt();
    mkdirSync(draftDir, { recursive: true });
    console.log(`스캔 시작 -> ${draftDir}`);
    const result = spawnSync("node", [cliPath, "scan", srcDir, "--out", draftDir], {
      cwd: repoRoot,
      stdio: "inherit",
    });
    if (result.status !== 0) {
      console.error("스캔 실패");
      process.exit(result.status ?? 1);
    }
  }

  if (flags["scan-only"]) {
    console.log(`\n다음 단계: Claude Code에서 실행 -> /episode ${srcArg}`);
    return;
  }

  if (await isPortOpen(WEB_PORT)) {
    console.log(
      `\n웹 에디터가 이미 http://localhost:${WEB_PORT} 에 떠 있습니다 (그대로 둡니다).\n` +
        `다른 에피소드용으로 떠 있는 경우 CUESHEET_PATH가 다를 수 있으니, 이 에피소드로 보려면 서버를 재시작하세요:\n` +
        `  CUESHEET_PATH=${cuesheetPath} pnpm --filter @cuesheet/web dev`,
    );
  } else {
    console.log(`웹 에디터 기동 중... (CUESHEET_PATH=${cuesheetPath})`);
    const child = spawn("pnpm", ["--filter", "@cuesheet/web", "dev"], {
      cwd: repoRoot,
      env: { ...process.env, CUESHEET_PATH: cuesheetPath },
      detached: true,
      stdio: "ignore",
    });
    child.unref();

    const up = await waitForPort(WEB_PORT, 15000);
    if (!up) {
      console.error(
        `${WEB_PORT}번 포트가 15초 안에 뜨지 않았습니다 - 로그 확인 필요(pnpm --filter @cuesheet/web dev 직접 실행).`,
      );
    }
  }

  if (!flags["no-open"]) {
    openBrowser(`http://localhost:${WEB_PORT}`);
  }

  console.log(`\n에디터: http://localhost:${WEB_PORT}`);
  console.log(`다음 단계: Claude Code에서 실행 -> /episode ${srcArg}`);
}

main();
