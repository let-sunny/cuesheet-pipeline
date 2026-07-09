import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CueSheet, Title } from "@cuesheet/schema";
import { gooeyAnimationHtml, meltAnimationHtml, particleAnimationHtml } from "./titleAnimations.js";

/** Where prepareTitleAssets defaults to writing the ASS/PNG-sequence cache (gitignored). */
export const DEFAULT_TITLE_CACHE_DIR = "media/title-cache";

export interface TitleAssAsset {
  kind: "ass";
  /** Path to a written .ass file (subtitles= filter reads this from disk). */
  path: string;
}

export interface TitleFramesAsset {
  kind: "frames";
  /** Directory containing frame_%04d.png (0-indexed, zero-padded to 4 digits). */
  dir: string;
  frameCount: number;
  fps: number;
}

export type TitleAsset = TitleAssAsset | TitleFramesAsset;

/**
 * Content-addressed cache key for a title card's headless-captured frames - same (text, preset,
 * durationS, project dimensions/fps) always produces the same key, so a re-render (or a second
 * cut reusing the same title) can skip capture entirely on a cache hit. Only meaningful for the
 * capture-based presets (gooey/melt/particle); typing doesn't need caching (ASS generation is
 * effectively instant - see docs/research/title-render-spike.md).
 */
export function titleCacheKey(
  title: Pick<Title, "text" | "preset" | "durationS">,
  project: Pick<CueSheet["project"], "width" | "height" | "fps">,
): string {
  const payload = JSON.stringify({
    text: title.text,
    preset: title.preset,
    durationS: title.durationS,
    width: project.width,
    height: project.height,
    fps: project.fps,
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

/** ASS color in &HAABBGGRR form (ASS alpha is inverted: 00 = opaque, FF = fully transparent). */
function assColor(alphaHex: string, bbggrr: string): string {
  return `&H${alphaHex}${bbggrr}`;
}

/** Escapes text for the ASS Dialogue Text field (literal braces would be read as override tags). */
function escapeAssText(text: string): string {
  return text.replace(/\\/g, "").replace(/\{/g, "(").replace(/\}/g, ")").replace(/\n/g, "\\N");
}

/** Formats seconds as ASS's H:MM:SS.CC (centisecond) timestamp. */
export function formatAssTime(seconds: number): string {
  const cs = Math.max(0, Math.round(seconds * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(c).padStart(2, "0")}`;
}

/**
 * Builds the ASS file content for the "typing" preset: a per-character \k karaoke reveal (each
 * character invisible - via a fully-transparent SecondaryColour - until its turn) plus a whole-line
 * \fad for a quick fade in/out, spanning [0, title.durationS] in the segment's own local timeline
 * (title always starts at the cut's start - see schema, there is no separate `start` field).
 */
export function buildTitleAssContent(
  title: Title,
  project: Pick<CueSheet["project"], "width" | "height">,
): string {
  const chars = Array.from(title.text);
  const totalCs = Math.max(1, Math.round(title.durationS * 100));
  const perCharCs = Math.max(1, Math.floor(totalCs / Math.max(1, chars.length)));
  const karaoke = chars.map((ch) => `{\\k${perCharCs}}${escapeAssText(ch)}`).join("");
  const fontSize = Math.round(project.height * 0.08);
  const fadeMs = Math.min(300, Math.round((title.durationS * 1000) / 4));

  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${project.width}
PlayResY: ${project.height}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Title,Pretendard,${fontSize},${assColor("00", "FFFFFF")},${assColor("FF", "FFFFFF")},${assColor("00", "000000")},${assColor("00", "000000")},0,0,0,0,100,100,0,0,1,3,0,5,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,${formatAssTime(0)},${formatAssTime(title.durationS)},Title,,0,0,0,,{\\fad(${fadeMs},${fadeMs})}${karaoke}
`;
}

/** Escapes a filesystem path for use as a filtergraph filter argument (subtitles=<path>). */
export function escapeFilterPath(path: string): string {
  return path.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

function animationHtmlFor(preset: "gooey" | "melt" | "particle", params: { text: string; width: number; height: number; frameCount: number }): string {
  switch (preset) {
    case "gooey":
      return gooeyAnimationHtml(params);
    case "melt":
      return meltAnimationHtml(params);
    case "particle":
      return particleAnimationHtml(params);
  }
}

/**
 * Dynamically imports Playwright - a devDependency of this package, only actually required at
 * runtime for the gooey/melt/particle capture path (typing needs no browser at all). Kept as a
 * dynamic import (rather than a static one) so a render environment without Playwright installed
 * can still render typing-only titles; capturing a gooey/melt/particle title without it throws a
 * clear, named error instead of an opaque module-not-found stack trace.
 */
async function loadPlaywright(): Promise<typeof import("playwright")> {
  try {
    return await import("playwright");
  } catch (e) {
    throw new Error(
      `preset requires the "playwright" package to render (missing dependency) - install it with ` +
        `\`pnpm add -D playwright --filter @cuesheet/render\` and \`npx playwright install chromium\` ` +
        `(${(e as Error).message})`,
    );
  }
}

interface PrepareTitleAssetsOptions {
  /** Directory for the ASS/PNG-sequence cache. Defaults to DEFAULT_TITLE_CACHE_DIR. */
  cacheDir?: string;
}

/**
 * Populates the on-disk title cache (ASS files + captured PNG sequences) for every segment with a
 * `title`, and returns a map from segment index to the resulting TitleAsset for buildRenderPlan to
 * wire into the filter graph. Kept separate from buildRenderPlan (which stays a pure, synchronous,
 * I/O-free function) - this is the one place in the title pipeline that touches disk or spawns a
 * headless browser, matching the existing CLI/plan.ts split (probing/capture in the caller,
 * pure planning in buildRenderPlan).
 */
export async function prepareTitleAssets(
  cue: CueSheet,
  opts: PrepareTitleAssetsOptions = {},
): Promise<Record<number, TitleAsset>> {
  const cacheDir = opts.cacheDir ?? DEFAULT_TITLE_CACHE_DIR;
  const result: Record<number, TitleAsset> = {};

  for (let i = 0; i < cue.segments.length; i++) {
    const title = cue.segments[i]?.title;
    if (!title) continue;

    if (title.preset === "typing") {
      const key = titleCacheKey(title, cue.project);
      const dir = join(cacheDir, "ass");
      await mkdir(dir, { recursive: true });
      const path = join(dir, `${key}.ass`);
      await writeFile(path, buildTitleAssContent(title, cue.project), "utf-8");
      result[i] = { kind: "ass", path };
      continue;
    }

    const key = titleCacheKey(title, cue.project);
    const dir = join(cacheDir, key);
    const metaPath = join(dir, "meta.json");
    const frameCount = Math.max(1, Math.round(title.durationS * cue.project.fps));

    if (existsSync(metaPath)) {
      const meta = JSON.parse(await readFile(metaPath, "utf-8")) as { frameCount: number };
      if (meta.frameCount === frameCount) {
        result[i] = { kind: "frames", dir, frameCount, fps: cue.project.fps };
        continue;
      }
    }

    await mkdir(dir, { recursive: true });
    const playwright = await loadPlaywright().catch((e: Error) => {
      throw new Error(`segments[${i}].title: ${e.message}`);
    });
    const browser = await playwright.chromium.launch();
    try {
      const page = await browser.newPage({
        viewport: { width: cue.project.width, height: cue.project.height },
      });
      const html = animationHtmlFor(title.preset as "gooey" | "melt" | "particle", {
        text: title.text,
        width: cue.project.width,
        height: cue.project.height,
        frameCount,
      });
      await page.setContent(html);
      await page.waitForFunction("typeof globalThis.seekAnimation === 'function'");
      for (let frame = 0; frame < frameCount; frame++) {
        await page.evaluate(
          (f: number) => (globalThis as unknown as { seekAnimation: (f: number) => void }).seekAnimation(f),
          frame,
        );
        // A canvas-based preset (particle) draws via a 2D context call, which doesn't itself
        // force the browser to composite/paint before the next screenshot - verified empirically
        // (2026-07-09): without this, the first ~30 captured frames were byte-identical blanks
        // (the compositor hadn't caught up yet), only "waking up" partway through the sequence.
        // SVG-based presets (gooey/melt) don't need this (DOM mutations are always in sync with
        // the next paint), but waiting here is harmless for them too - two rAF ticks reliably
        // span one full paint cycle in Chromium.
        await page.evaluate(
          "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
        );
        const framePath = join(dir, `frame_${String(frame).padStart(4, "0")}.png`);
        await page.screenshot({ path: framePath, omitBackground: true });
      }
    } finally {
      await browser.close();
    }
    await writeFile(metaPath, JSON.stringify({ frameCount, fps: cue.project.fps }), "utf-8");
    result[i] = { kind: "frames", dir, frameCount, fps: cue.project.fps };
  }

  return result;
}
