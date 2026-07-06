#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { validateCueSheet } from "@cuesheet/schema";
import { buildRenderPlan } from "./plan.js";

/**
 * CLI: 큐시트 파일을 읽어 검증하고, ffmpeg로 본편을 렌더한다.
 * 사용법: cuesheet-render [큐시트.json] [출력.mp4] [--no-subtitles]
 * 기본값: project.cuesheet.json → out.mp4, 자막 굽기 켜짐
 * --no-subtitles: drawtext를 생략한 클린 영상을 만든다(CC/SRT 트랙과 조합용).
 */
const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const burnSubtitles = !process.argv.includes("--no-subtitles");
const cuePath = positional[0] ?? process.env.CUESHEET_PATH ?? "project.cuesheet.json";
const outPath = positional[1] ?? "out.mp4";

let raw: unknown;
try {
  raw = JSON.parse(readFileSync(cuePath, "utf-8"));
} catch (e) {
  console.error(`큐시트를 읽을 수 없습니다(${cuePath}): ${String(e)}`);
  process.exit(1);
}

const result = validateCueSheet(raw);
if (!result.ok) {
  console.error(`큐시트 검증 실패:\n${result.errors.join("\n")}`);
  process.exit(1);
}

const plan = buildRenderPlan(result.data, outPath, { burnSubtitles });
console.error(`ffmpeg ${plan.args.join(" ")}`);

const proc = spawn("ffmpeg", plan.args, { stdio: "inherit" });
proc.on("error", (e) => {
  console.error(`ffmpeg 실행 실패(설치되어 있나요?): ${e.message}`);
  process.exit(1);
});
proc.on("exit", (code) => {
  process.exit(code ?? 0);
});
