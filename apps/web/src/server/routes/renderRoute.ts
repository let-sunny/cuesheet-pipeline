import { readFile, mkdir } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import type { ViteDevServer } from "vite";
import { validateCueSheet } from "@cuesheet/schema";
import { buildRenderPlan, DEFAULT_TITLE_CACHE_DIR, prepareTitleAssets } from "@cuesheet/render";
import {
  contentDispositionHeader,
  overallRenderProgress,
  probeDurationSeconds,
  readRequestBody,
  repoRoot,
  resolveRepoPath,
  sendJson,
} from "../shared.js";
import { renderOutputPathFor } from "./fileNaming.js";
import { estimateOutputSeconds, extractFfmpegErrorSummary, parseFfmpegTimeSeconds } from "./renderProgress.js";

/**
 * Registers /api/render/status, /api/render, and /out.mp4 - these three share module-scoped
 * render-job state (only one render runs at a time) so they're registered together. Mind the
 * registration order: render/status must be registered before /api/render so it's handled before
 * it gets caught by /api/render's prefix match.
 */
export function registerRenderRoutes(server: ViteDevServer, filePath: string): void {
  server.middlewares.use("/api/render/status", (req, res) => {
    if (req.method !== "GET") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Method not allowed");
      return;
    }
    sendJson(res, 200, {
      state: renderJob.state,
      progress: renderJob.progress,
      error: renderJob.error,
      errorDetail: renderJob.errorDetail,
      outputReady: renderJob.state === "done" && lastRenderOutputPath !== null && existsSync(lastRenderOutputPath),
    });
  });

  server.middlewares.use("/api/render", async (req, res) => {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Method not allowed");
      return;
    }

    if (renderInProgress) {
      sendJson(res, 409, { ok: false, error: "A render is already in progress" });
      return;
    }

    // Subtitle burn-in option (default true) — {"burnSubtitles": false} produces a clean video for CC/SRT use.
    let burnSubtitles = true;
    try {
      const body = await readRequestBody(req);
      if (body.trim().length > 0) {
        const requestBody = JSON.parse(body) as { burnSubtitles?: unknown };
        if (typeof requestBody.burnSubtitles === "boolean") {
          burnSubtitles = requestBody.burnSubtitles;
        }
      }
    } catch {
      // Use the default (true) if the body is missing or unparseable.
    }

    let parsed: unknown;
    try {
      const raw = await readFile(filePath, "utf8");
      parsed = JSON.parse(raw);
    } catch {
      sendJson(res, 400, {
        ok: false,
        error: "(root): could not read or parse the cuesheet file",
      });
      return;
    }

    const result = validateCueSheet(parsed);
    if (!result.ok) {
      sendJson(res, 400, { ok: false, error: result.errors.join("\n") });
      return;
    }

    // Responds with jobId as soon as validation passes, and runs ffmpeg in the background,
    // updating only the progress in renderJob (doesn't make the caller wait — prevents blocking
    // for the several minutes a render can take).
    renderInProgress = true;
    renderJobCounter += 1;
    const jobId = String(renderJobCounter);
    const totalSeconds = estimateOutputSeconds(result.data);
    renderJob = { state: "running", progress: 0 };

    // ffmpeg runs inheriting this vite server's cwd (apps/web) as-is, so if clipDir is a
    // relative path, convert it to an absolute path based on the repo root before passing it in.
    const cueForRender = { ...result.data, clipDir: resolveRepoPath(result.data.clipDir) };
    const outputPath = renderOutputPathFor(renderOutputDir, result.data.project.name);
    await mkdir(renderOutputDir, { recursive: true });

    // Title cards (any preset - all render via Remotion) need their frames captured (or read from
    // cache) before buildRenderPlan can reference them - buildRenderPlan itself stays pure/sync
    // (see plan.ts).
    let titleAssets;
    try {
      titleAssets = result.data.segments.some((s) => s.title)
        ? await prepareTitleAssets(cueForRender, { cacheDir: resolveRepoPath(DEFAULT_TITLE_CACHE_DIR) })
        : undefined;
    } catch (e) {
      renderInProgress = false;
      sendJson(res, 400, { ok: false, error: (e as Error).message });
      return;
    }

    // BGM ducking (PRD backlog #4) needs each narrated segment's own clip duration up front -
    // buildRenderPlan stays pure/sync (see plan.ts), so probing happens here, same pattern as
    // title assets above. Only probed when ducking is actually on (nothing to skip past otherwise).
    const narrationDurations: Record<number, number> = {};
    if (cueForRender.narration?.enabled && cueForRender.narration.ducking) {
      const narrationDir = resolveRepoPath(cueForRender.narration.dir);
      await Promise.all(
        cueForRender.segments.map(async (s, i) => {
          if (!s.narration) return;
          const durationS = await probeDurationSeconds(resolve(narrationDir, s.narration));
          if (durationS != null) narrationDurations[i] = durationS;
        }),
      );
    }

    let plan;
    try {
      plan = buildRenderPlan(cueForRender, outputPath, { burnSubtitles, titleAssets, narrationDurations });
    } catch (e) {
      renderInProgress = false;
      sendJson(res, 400, { ok: false, error: (e as Error).message });
      return;
    }
    for (const warning of plan.warnings) {
      server.config.logger.warn(`[render] ${warning}`);
    }
    // A plan is one or more sequential ffmpeg commands (2-pass when captured-frames titles
    // meet a large concat graph - see @cuesheet/render's twoPass.ts). Overall progress maps
    // each pass to an equal slice: (passIndex + withinPass) / passCount.
    const commands = plan.commands;
    const runCommand = (index: number) => {
      const command = commands[index];
      if (!command) return;
      const proc = spawn("ffmpeg", command.args, { stdio: ["ignore", "pipe", "pipe"] });
      let stderr = "";
      proc.stdout?.on("data", () => {});
      proc.stderr?.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf8");
        stderr += text;
        const seconds = parseFfmpegTimeSeconds(text);
        if (seconds != null && totalSeconds > 0) {
          const pct = overallRenderProgress(index, commands.length, seconds / totalSeconds);
          renderJob = { state: "running", progress: pct };
        }
      });
      proc.on("error", (e) => {
        renderInProgress = false;
        renderJob = {
          state: "error",
          progress: renderJob.progress,
          error: `ffmpeg failed to start (is it installed?): ${e.message}`,
        };
      });
      proc.on("exit", (code) => {
        if (code !== 0) {
          renderInProgress = false;
          renderJob = {
            state: "error",
            progress: renderJob.progress,
            error: `[${command.label}] ${extractFfmpegErrorSummary(stderr)}`,
            errorDetail: stderr.slice(-4000),
          };
          return;
        }
        if (index + 1 < commands.length) {
          runCommand(index + 1);
          return;
        }
        renderInProgress = false;
        renderJob = { state: "done", progress: 100 };
        lastRenderName = result.data.project.name;
        lastRenderBurnSubtitles = burnSubtitles;
        lastRenderOutputPath = outputPath;
      });
    };
    runCommand(0);

    sendJson(res, 200, { ok: true, jobId });
  });

  server.middlewares.use("/out.mp4", (req, res) => {
    if (req.method !== "GET") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Method not allowed");
      return;
    }

    if (!lastRenderOutputPath || !existsSync(lastRenderOutputPath)) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Render output not found");
      return;
    }

    const baseName = lastRenderName ?? "export";
    const fileName = lastRenderBurnSubtitles ? `${baseName}.mp4` : `${baseName} (no subtitles).mp4`;
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Disposition", contentDispositionHeader("export.mp4", fileName));
    createReadStream(lastRenderOutputPath).pipe(res);
  });
}

const renderOutputDir = resolve(repoRoot, "out");

// Minimal flag to block concurrent requests while a render is in progress (no queuing).
let renderInProgress = false;

// Remembers the project name + subtitle-burn option + output path of the last successfully
// completed render, so /out.mp4 can name the download after the project (mirrors
// /api/subtitles.srt) instead of a generic "out.mp4", and can find the right file under out/.
let lastRenderName: string | null = null;
let lastRenderBurnSubtitles = true;
let lastRenderOutputPath: string | null = null;

interface RenderJobState {
  state: "idle" | "running" | "done" | "error";
  progress: number;
  /** Short, extracted summary of the failure - what the client shows in the toast/banner. */
  error?: string;
  /** Full raw ffmpeg stderr dump, for a collapsible "show details" section on the client. */
  errorDetail?: string;
}

// State of the last (or currently running) render job. Since only one job exists at a time, a single
// module-scope variable is enough without a separate store (history management is out of scope).
let renderJob: RenderJobState = { state: "idle", progress: 0 };
let renderJobCounter = 0;
