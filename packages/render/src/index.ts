#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { validateCueSheet } from "@cuesheet/schema";
import { buildRenderPlan } from "./plan.js";
import type { SourceDimensions } from "./plan.js";
import { buildSrt } from "./srt.js";
import { prepareTitleAssets } from "./title.js";

/** Structured `cuesheet-render --json` result. */
export interface RenderJsonResult {
  outputPath: string;
  /** Rendered output duration in seconds (ffprobe on the produced file), or null if it couldn't be probed. */
  durationS: number | null;
  srtPath: string | null;
}

/**
 * CLI: reads a cuesheet file, validates it, and renders the final video with ffmpeg.
 * Usage: cuesheet-render [cuesheet.json] [output.mp4] [--no-subtitles] [--srt <path>] [--json]
 * Defaults: project.cuesheet.json -> out.mp4, subtitle burn-in on
 * --no-subtitles: produces a clean video without drawtext (for combining with a CC/SRT track).
 * --srt <path>: also writes an SRT file from the same cuesheet (same logic as web's /api/subtitles.srt).
 * --json: on success, emits a single structured result object (RenderJsonResult) to stdout —
 * human-readable progress/errors always go to stderr, --json or not, so stdout stays parseable.
 */
const args = process.argv.slice(2);
const srtFlagIndex = args.indexOf("--srt");
const srtOutPath = srtFlagIndex === -1 ? null : (args[srtFlagIndex + 1] ?? null);
const positional = args.filter(
  (a, i) => !a.startsWith("--") && (srtFlagIndex === -1 || i !== srtFlagIndex + 1),
);
const burnSubtitles = !args.includes("--no-subtitles");
const jsonMode = args.includes("--json");
const cuePath = positional[0] ?? process.env.CUESHEET_PATH ?? "project.cuesheet.json";
const outPath = positional[1] ?? "out.mp4";

let raw: unknown;
try {
  raw = JSON.parse(readFileSync(cuePath, "utf-8"));
} catch (e) {
  console.error(`Could not read the cuesheet (${cuePath}): ${String(e)}`);
  process.exit(1);
}

const result = validateCueSheet(raw);
if (!result.ok) {
  console.error(`Cuesheet validation failed:\n${result.errors.join("\n")}`);
  process.exit(1);
}

if (srtOutPath !== null) {
  writeFileSync(srtOutPath, buildSrt(result.data), "utf-8");
  console.error(`SRT saved: ${srtOutPath}`);
}

/** Probes a video file's pixel width/height via ffprobe. Returns null on failure. */
function probeDimensions(path: string): SourceDimensions | null {
  const proc = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "csv=s=x:p=0",
      path,
    ],
    { encoding: "utf-8" },
  );
  if (proc.status !== 0) return null;
  const match = proc.stdout.trim().match(/^(\d+)x(\d+)$/);
  if (!match) return null;
  return { width: Number(match[1]), height: Number(match[2]) };
}

/** Probes a media file's duration (seconds) via ffprobe. Returns null on failure. */
function probeDurationS(path: string): number | null {
  const proc = spawnSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", path],
    { encoding: "utf-8" },
  );
  if (proc.status !== 0) return null;
  const value = Number.parseFloat(proc.stdout.trim());
  return Number.isFinite(value) ? value : null;
}

// Only cropped clips need probing (buildRenderPlan's crop/project-aspect check is a no-op for
// clips without a sourceDimensions entry).
const croppedClips = new Set(result.data.segments.filter((s) => s.crop).map((s) => s.clip));
const sourceDimensions: Record<string, SourceDimensions> = {};
for (const clip of croppedClips) {
  const dims = probeDimensions(join(result.data.clipDir, clip));
  if (dims) sourceDimensions[clip] = dims;
}

// Only needed when ducking is on (deriveDuckingWindows needs each narrated segment's clip
// duration) - probing every narration file unconditionally would be wasted work otherwise.
const narrationDurations: Record<number, number> = {};
const narrationConfig = result.data.narration;
if (narrationConfig?.enabled && narrationConfig.ducking) {
  result.data.segments.forEach((s, i) => {
    if (!s.narration) return;
    const durationS = probeDurationS(join(narrationConfig.dir, s.narration));
    if (durationS != null) narrationDurations[i] = durationS;
  });
}

const hasAnyTitle = result.data.segments.some((s) => s.title);
let titleAssets: Record<number, import("./title.js").TitleAsset> = {};
if (hasAnyTitle) {
  try {
    titleAssets = await prepareTitleAssets(result.data);
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
}

let plan;
try {
  plan = buildRenderPlan(result.data, outPath, {
    burnSubtitles,
    sourceDimensions,
    titleAssets,
    narrationDurations,
  });
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
for (const warning of plan.warnings) {
  console.error(`Warning: ${warning}`);
}
console.error(`ffmpeg ${plan.args.join(" ")}`);

const proc = spawn("ffmpeg", plan.args, { stdio: "inherit" });
proc.on("error", (e) => {
  console.error(`Failed to run ffmpeg (is it installed?): ${e.message}`);
  process.exit(1);
});
proc.on("exit", (code) => {
  if (jsonMode && (code ?? 0) === 0) {
    const result: RenderJsonResult = {
      outputPath: outPath,
      durationS: probeDurationS(outPath),
      srtPath: srtOutPath,
    };
    console.log(JSON.stringify(result));
  }
  process.exit(code ?? 0);
});
