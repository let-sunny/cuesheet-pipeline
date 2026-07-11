import { strict as nodeAssert } from "node:assert";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { ensureBrowser, renderFrames, selectComposition } from "@remotion/renderer";
import type { CueSheet, Title } from "@cuesheet/schema";
import type { TitleCardProps } from "./remotion/TitleCard.js";

/** Where prepareTitleAssets writes the captured PNG-sequence cache (gitignored). */
export const DEFAULT_TITLE_CACHE_DIR = "media/title-cache";

export interface TitleFramesAsset {
  kind: "frames";
  /** Directory containing frame_%04d.png (0-indexed, zero-padded to 4 digits). */
  dir: string;
  frameCount: number;
  fps: number;
}

/**
 * Every title preset (fade/wordStagger/typing/highlight) now renders through this one asset kind -
 * a Remotion-captured, transparent PNG frame sequence (see docs/research/title-render-spike.md for
 * the ASS/hand-rolled-HTML approaches this replaced). Kept as its own named type (rather than
 * inlining TitleFramesAsset everywhere) so a future second asset kind, if one is ever needed again,
 * is a small, localized change.
 */
export type TitleAsset = TitleFramesAsset;

/**
 * Content-addressed cache key for a title card's captured frames - same (text, preset, durationS,
 * project dimensions/fps) always produces the same key, so a re-render (or a second cut reusing
 * the same title) can skip capture entirely on a cache hit.
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

interface PrepareTitleAssetsOptions {
  /** Directory for the captured-PNG-sequence cache. Defaults to DEFAULT_TITLE_CACHE_DIR. */
  cacheDir?: string;
}

/**
 * Populates the on-disk title cache (captured PNG sequences) for every segment with a `title`, and
 * returns a map from segment index to the resulting TitleAsset for buildRenderPlan to wire into the
 * filter graph. Kept separate from buildRenderPlan (which stays a pure, synchronous, I/O-free
 * function) - this is the one place in the title pipeline that touches disk or spawns a headless
 * browser (via Remotion), matching the existing CLI/plan.ts split (probing/capture in the caller,
 * pure planning in buildRenderPlan).
 *
 * The Remotion bundle (an expensive webpack build) is memoized once per call and reused for every
 * title in this batch - see ensureRemotionServeUrl. It's only built lazily, on the first actual
 * cache miss, so a cuesheet whose titles are all still cache-hits never pays for it.
 */
export async function prepareTitleAssets(
  cue: CueSheet,
  opts: PrepareTitleAssetsOptions = {},
): Promise<Record<number, TitleAsset>> {
  const cacheDir = opts.cacheDir ?? DEFAULT_TITLE_CACHE_DIR;
  const result: Record<number, TitleAsset> = {};
  let serveUrlPromise: Promise<string> | null = null;

  for (let i = 0; i < cue.segments.length; i++) {
    const title = cue.segments[i]?.title;
    if (!title) continue;

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

    if (!serveUrlPromise) {
      serveUrlPromise = ensureRemotionServeUrl();
    }
    const serveUrl = await serveUrlPromise;

    await mkdir(dir, { recursive: true });
    await renderTitleFrames({ dir, serveUrl, title, project: cue.project, frameCount });
    await writeFile(metaPath, JSON.stringify({ frameCount, fps: cue.project.fps }), "utf-8");
    result[i] = { kind: "frames", dir, frameCount, fps: cue.project.fps };
  }

  return result;
}

/**
 * Downloads Chrome Headless Shell if missing (replaces the old Playwright chromium dependency),
 * then bundles the Remotion composition entry point once. The returned serveUrl (a local bundle
 * path Remotion's renderer knows how to serve) is reused for every title card in the batch -
 * bundling is a full webpack build and is far too expensive to repeat per title.
 */
async function ensureRemotionServeUrl(): Promise<string> {
  await ensureBrowser();
  return bundle({ entryPoint: resolveRemotionEntryPoint() });
}

/**
 * Locates packages/render/src/remotion/index.tsx relative to this module's own file, regardless of
 * whether it's running as compiled dist/title.js (sibling dist/remotion/index.js, JSX already
 * compiled to plain JS by this package's own tsc build) or as source under vitest/ts-node
 * (sibling src/remotion/index.tsx). Either is a valid webpack entry point for @remotion/bundler.
 */
function resolveRemotionEntryPoint(): string {
  const here = fileURLToPath(new URL(".", import.meta.url));
  const candidates = ["remotion/index.tsx", "remotion/index.ts", "remotion/index.js"].map((p) => join(here, p));
  const found = candidates.find((p) => existsSync(p));
  if (!found) {
    throw new Error(
      `Could not locate the Remotion entry point for title-card rendering - looked in: ${candidates.join(", ")}`,
    );
  }
  return found;
}

/**
 * Renders one title's frames via Remotion into a fresh, isolated `dir/_raw` subdirectory (so
 * nothing here can be confused by leftover files from an interrupted previous attempt at this same
 * cache key), then hands off to normalizeFrameFilenames to produce the frame_%04d.png contract
 * twoPass.ts's buildTitleOverlayPass and plan.ts's addClip both rely on.
 */
async function renderTitleFrames(args: {
  dir: string;
  serveUrl: string;
  title: Title;
  project: Pick<CueSheet["project"], "width" | "height" | "fps">;
  frameCount: number;
}): Promise<void> {
  const { dir, serveUrl, title, project, frameCount } = args;
  const rawDir = join(dir, "_raw");
  await rm(rawDir, { recursive: true, force: true });
  await mkdir(rawDir, { recursive: true });

  const inputProps: TitleCardProps = {
    text: title.text,
    preset: title.preset,
    durationInSeconds: title.durationS,
    fps: project.fps,
    color: TITLE_TEXT_COLOR,
    width: project.width,
    height: project.height,
  };

  const composition = await selectComposition({ serveUrl, id: "TitleCard", inputProps });
  await renderFrames({
    composition,
    serveUrl,
    outputDir: rawDir,
    imageFormat: "png",
    inputProps,
    onStart: () => {},
    onFrameUpdate: () => {},
  });

  await normalizeFrameFilenames(rawDir, dir, frameCount, title.text);
  await rm(rawDir, { recursive: true, force: true });
}

/**
 * Reads every ".png" file Remotion produced in `rawDir`, sorts them, and renames them into `dir`
 * as frame_0000.png, frame_0001.png, ... (4-digit zero-padded) by POSITION - safe because every
 * filename Remotion produces in one render shares the same zero-padding width (it pads to
 * `String(totalFrames-1).length` digits, not a fixed 4 - see @remotion/renderer's
 * getFilePadLength), so lexicographic order and frame order agree. Asserts the produced count
 * matches `frameCount` and that every renamed file matches the exact contract twoPass.ts's
 * buildTitleOverlayPass and plan.ts's addClip rely on (`frame_%04d.png` as an ffmpeg image2
 * input) - kept as its own function so this normalization can be exercised directly in tests
 * without needing a real (slow, browser-dependent) Remotion render.
 */
export async function normalizeFrameFilenames(
  rawDir: string,
  dir: string,
  frameCount: number,
  titleTextForErrors = "",
): Promise<void> {
  const produced = (await readdir(rawDir)).filter((f) => f.endsWith(".png")).sort();
  nodeAssert.equal(
    produced.length,
    frameCount,
    `Remotion produced ${produced.length} frame(s) for "${titleTextForErrors}" but expected ${frameCount}`,
  );
  for (let i = 0; i < produced.length; i++) {
    const from = join(rawDir, produced[i]!);
    const finalName = `frame_${String(i).padStart(4, "0")}.png`;
    nodeAssert.match(finalName, /^frame_\d{4}\.png$/);
    await rename(from, join(dir, finalName));
  }
}

/**
 * Fixed title-card text color (no schema field for this yet - every preset renders in this one
 * cozy, warm tone). SYNC: duplicated by hand in remotion/index.tsx's DEFAULT_PROPS.color, which is
 * only a Studio-preview default and isn't read by real renders (those always pass this constant via
 * renderTitleFrames's inputProps above) - see that file's comment for why there's no shared runtime
 * module between the two.
 */
const TITLE_TEXT_COLOR = "#3a3128";
