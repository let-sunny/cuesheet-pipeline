import { spawn } from "node:child_process";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolveCuesheetPath, resolveDomainDir } from "@cuesheet/active-episode";

const here = dirname(fileURLToPath(import.meta.url));
// src/server -> src -> web -> packages -> repo root
export const repoRoot = resolve(here, "../../../..");

/**
 * The cuesheet this editor session edits, resolved at startup from the active-episode source of
 * truth: explicit CUESHEET_PATH env > .active-episode file > project.cuesheet.json. (Following
 * .active-episode changes live, without a restart, is a separate follow-up - see #25.)
 */
export function cuesheetPath(): string {
  return resolveCuesheetPath({ repoRoot, env: process.env });
}

/**
 * The active domain bundle directory this editor session reads its scene vocabulary from
 * (DOMAIN_DIR env > .active-domain > domains/knitting), resolved the same way as the launcher and
 * the assemble CLI so all three agree on which domain a run uses (issue #31).
 */
export function domainDir(): string {
  return resolveDomainDir({ repoRoot, env: process.env });
}

/** Checks whether target is inside root (including root itself) — prevents path escape. */
export function isWithin(root: string, target: string): boolean {
  return target === root || target.startsWith(root + sep);
}

/** Resolves a relative path stored in the cuesheet (e.g. clipDir) to an absolute path based on the repo root (so it doesn't break if the folder moves). */
export function resolveRepoPath(dir: string): string {
  return isAbsolute(dir) ? dir : resolve(repoRoot, dir);
}

/**
 * Builds a Content-Disposition header value that downloads as fallbackAsciiName in browsers
 * that only understand the plain `filename` param, and as unicodeName (URI-encoded via the
 * `filename*` param, RFC 5987) elsewhere — this project's file names are usually Korean, so
 * unicodeName is normally what actually shows up in the saved file.
 */
export function contentDispositionHeader(fallbackAsciiName: string, unicodeName: string): string {
  return `attachment; filename="${fallbackAsciiName}"; filename*=UTF-8''${encodeURIComponent(unicodeName)}`;
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

export function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((res, rej) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString("utf8");
    });
    req.on("end", () => res(body));
    req.on("error", rej);
  });
}

export const clipMimeTypes: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".m4v": "video/x-m4v",
};

/**
 * Lists video files under `dir`, recursing into subfolders - the raw-footage-sorting convention
 * groups clips into `NN_label_date/` event-subfolders rather than a flat folder, and
 * `segment.clip` is written as that relative path (e.g. "001_label_260609/VID_...mp4"). Mirrors
 * @cuesheet/draft's scanFolder() recursion. A leading "_"/"." directory name (e.g. "_미리보기") is
 * skipped - a non-source preview/scratch area, same convention as elsewhere in this pipeline.
 */
export async function listVideoFilesRecursive(dir: string, relBase = ""): Promise<string[]> {
  const { readdir } = await import("node:fs/promises");
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith("_") || entry.name.startsWith(".")) continue;
    const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...(await listVideoFilesRecursive(resolve(dir, entry.name), relPath)));
    } else if (clipMimeTypes[entry.name.slice(entry.name.lastIndexOf(".")).toLowerCase()] !== undefined) {
      out.push(relPath);
    }
  }
  return out;
}

export const narrationAudioMimeTypes: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".wav": "audio/wav",
};

export function runFfmpeg(args: string[]): Promise<{ code: number | null; stderr: string }> {
  return new Promise((res) => {
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stdout?.on("data", () => {});
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    proc.on("error", (e) => {
      res({ code: null, stderr: `ffmpeg failed to start (is it installed?): ${e.message}` });
    });
    proc.on("exit", (code) => {
      res({ code, stderr });
    });
  });
}

/** Reads duration via ffprobe. Returns null on failure (unparseable / <= 0 / process error). */
export function probeDurationSeconds(path: string): Promise<number | null> {
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
 * Overall progress (0-99) for a multi-command render: each command gets an
 * equal slice, `within` is the 0-1 completion of the current command.
 */
export function overallRenderProgress(commandIndex: number, commandCount: number, within: number): number {
  const clamped = Math.min(1, Math.max(0, within));
  return Math.min(99, Math.round(((commandIndex + clamped) / commandCount) * 100));
}
