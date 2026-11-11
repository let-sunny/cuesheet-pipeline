#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { CueSheet } from "@cuesheet/schema";
import { ensureSegmentIds, formatIssue, validateCueSheet } from "@cuesheet/schema";
import { assembleDraft, findThumbnailCandidates, resolveAssembleConfig } from "./assemble.js";
import type { AssembleGrammarConfigOverride, ThumbnailCandidate } from "./assemble.js";
import { loadDomainBundle, momentsFileSchemaFor, resolveDomainAssembleConfig } from "./domain.js";
import { scanFolder } from "./scan.js";
import type { Manifest } from "./scan.js";
import { buildShortFfmpegArgs, planShorts } from "./shorts.js";
import type { ShortPlan } from "./shorts.js";
import { momentsFileSchema } from "./types.js";

/**
 * CLI: cuesheet-draft scan <source-folder> --out <work-folder> [--json]
 *      cuesheet-draft assemble --manifest <path> --moments <path> --clip-dir <source-folder>
 *                               --project-name <name> --out <cuesheet-path>
 *                               [--fps N] [--width N] [--height N] [--boundary-pad N]
 *                               [--config <path>] [--json]
 *      cuesheet-draft shorts --moments <path> --clip-dir <source-folder> --out-dir <folder>
 *                             [--max N] [--render] [--json]
 *
 * shorts: plans vertical Shorts from the same moments.json (shorts-plan.json); --render also
 * writes short-NN.mp4 per plan via ffmpeg. See shorts.ts.
 *
 * --config <path>: JSON file with a partial AssembleGrammarConfig override (cut rhythm,
 * quality threshold, timelapse-connector rules, face-heuristic word lists, boundary pad).
 * Deep-merged onto DEFAULT_ASSEMBLE_CONFIG (the user's grammar) — omit for existing behavior.
 *
 * --json: emits a single structured result object to stdout instead of nothing (human-readable
 * progress/errors always go to stderr, --json or not, so stdout stays parseable).
 */

/** Structured `cuesheet-draft scan --json` result. */
export interface ScanJsonResult {
  clips: number;
  evicted: number;
  frames: number;
  manifestPath: string;
}

/** Builds the scan stage's --json payload from the manifest it just wrote. */
export function buildScanJsonResult(manifest: Manifest, manifestPath: string): ScanJsonResult {
  return {
    clips: manifest.clips.length,
    evicted: manifest.evicted.length,
    frames: manifest.clips.reduce((n, c) => n + c.frames.length, 0),
    manifestPath,
  };
}

/** Structured `cuesheet-draft assemble --json` result. */
export interface AssembleJsonResult {
  segments: number;
  durationS: number;
  connectors: number;
  validationOk: boolean;
  outPath: string;
}

/**
 * Builds the assemble stage's --json payload from the already-validated cuesheet. Only ever
 * called after validateCueSheet succeeds, so validationOk is always true here — included as an
 * explicit field so a scripted caller doesn't have to infer success from process exit code alone.
 */
export function buildAssembleJsonResult(cue: CueSheet, outPath: string): AssembleJsonResult {
  return {
    segments: cue.segments.length,
    durationS: cue.segments.reduce((sum, s) => sum + (s.out - s.in) / s.speed, 0),
    connectors: cue.segments.filter((s) => s.speed !== 1).length,
    validationOk: true,
    outPath,
  };
}

/**
 * Builds the human-readable thumbnail-candidate report lines (item 3) printed to stderr after
 * assembly. Kept separate from the printing itself so the formatting is unit-testable without
 * spawning the CLI.
 */
export function buildThumbnailReportLines(candidates: ThumbnailCandidate[]): string[] {
  if (candidates.length === 0) return [];
  return [
    `Thumbnail candidates (${candidates.length}):`,
    ...candidates.map((c) => `  ${c.clip} @${c.inS}s [${c.shotType}] ${c.memo}`),
  ];
}

interface ParsedArgs {
  positional: string[];
  flags: Record<string, string>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = "true";
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

async function runScan(rest: string[]): Promise<void> {
  const { positional, flags } = parseArgs(rest);
  const srcDir = positional[0];
  const outDir = flags.out;
  if (!srcDir || !outDir) {
    console.error("Usage: cuesheet-draft scan <source-folder> --out <work-folder> [--json]");
    process.exit(1);
  }

  mkdirSync(outDir, { recursive: true });
  const manifest = await scanFolder(srcDir, outDir);
  const manifestPath = join(outDir, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  const totalFrames = manifest.clips.reduce((n, c) => n + c.frames.length, 0);
  console.error(
    `Scan complete: ${manifest.clips.length} local / ${manifest.evicted.length} not downloaded, ${totalFrames} frames -> ${manifestPath}`,
  );

  if (flags.json === "true") {
    console.log(JSON.stringify(buildScanJsonResult(manifest, manifestPath)));
  }
}

function runAssemble(rest: string[]): void {
  const { flags } = parseArgs(rest);
  const manifestPath = flags.manifest;
  const momentsPath = flags.moments;
  const clipDir = flags["clip-dir"];
  const projectName = flags["project-name"];
  const outPath = flags.out;

  if (!manifestPath || !momentsPath || !clipDir || !projectName || !outPath) {
    console.error(
      "Usage: cuesheet-draft assemble --manifest <path> --moments <path> --clip-dir <source-folder> --project-name <name> --out <cuesheet-path> [--domain <dir>] [--json]",
    );
    process.exit(1);
  }

  // manifest.json holds the list of actually scanned clips/frame info from the scan stage.
  // Extract per-clip durS and use it to clamp boundary padding so it doesn't extend past
  // the clip's end.
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as Manifest;
  const clipDurations = Object.fromEntries(manifest.clips.map((c) => [c.name, c.durS]));
  // Landscape first: portrait clips (flagged by scan) get a rotate in assemble.
  const portraitClips = manifest.clips.filter((c) => c.portrait).map((c) => c.name);

  // --domain <dir>: load the theme bundle so moments are validated against the domain's shot
  // vocabulary and its grammar/face policy drive assembly. Omit for the engine defaults.
  let bundle: ReturnType<typeof loadDomainBundle> | undefined;
  if (flags.domain) {
    try {
      bundle = loadDomainBundle(flags.domain);
    } catch (e) {
      console.error(`domain bundle load failed:\n${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    }
  }

  const momentsRaw = JSON.parse(readFileSync(momentsPath, "utf-8"));
  const momentsResult = (bundle ? momentsFileSchemaFor(bundle) : momentsFileSchema).safeParse(momentsRaw);
  if (!momentsResult.success) {
    console.error(`moments.json validation failed:\n${momentsResult.error.issues.map(formatIssue).join("\n")}`);
    process.exit(1);
  }

  const config: AssembleGrammarConfigOverride | undefined = flags.config
    ? (JSON.parse(readFileSync(flags.config, "utf-8")) as AssembleGrammarConfigOverride)
    : undefined;
  const configBase = bundle ? resolveDomainAssembleConfig(bundle) : undefined;

  const cueInput = assembleDraft(momentsResult.data, {
    clipDir,
    projectName,
    fps: flags.fps ? Number(flags.fps) : undefined,
    width: flags.width ? Number(flags.width) : undefined,
    height: flags.height ? Number(flags.height) : undefined,
    boundaryPadS: flags["boundary-pad"] ? Number(flags["boundary-pad"]) : undefined,
    clipDurations,
    portraitClips,
    config,
    configBase,
    facePolicyEnabled: bundle ? bundle.facePolicy.enabled : undefined,
  });

  const validated = validateCueSheet(cueInput);
  if (!validated.ok) {
    console.error(`Cuesheet validation failed:\n${validated.errors.join("\n")}`);
    process.exit(1);
  }

  // Stamp a stable id onto each segment so the draft starts with ids (assembleDraft itself stays
  // a pure/deterministic function; id assignment - which is non-deterministic - lives here on the
  // write path).
  const stamped = ensureSegmentIds(validated.data);
  writeFileSync(outPath, JSON.stringify(stamped, null, 2));
  console.error(`Assembly complete: ${stamped.segments.length} segments -> ${outPath}`);

  const resolvedConfig = resolveAssembleConfig(config, configBase);
  const thumbnailCandidates = findThumbnailCandidates(momentsResult.data, resolvedConfig.faceHeuristic);
  for (const line of buildThumbnailReportLines(thumbnailCandidates)) {
    console.error(line);
  }

  if (flags.json === "true") {
    console.log(JSON.stringify(buildAssembleJsonResult(stamped, outPath)));
  }
}

/** `shorts --json` payload: one entry per planned Short, `outPath` set only when it was rendered. */
export interface ShortsJsonResult {
  shorts: Array<{ id: string; durationS: number; cuts: number; hook: string; outPath: string | null }>;
  planPath: string;
}

export function buildShortsJsonResult(
  plans: ShortPlan[],
  planPath: string,
  outPaths: Record<string, string>,
): ShortsJsonResult {
  return {
    shorts: plans.map((p) => ({
      id: p.id,
      durationS: p.durationS,
      cuts: p.cuts.length,
      hook: p.hook,
      outPath: outPaths[p.id] ?? null,
    })),
    planPath,
  };
}

/** Human-readable plan summary printed to stderr, kept pure so the formatting is unit-testable. */
export function buildShortsReportLines(plans: ShortPlan[]): string[] {
  if (plans.length === 0) return ["No Shorts planned: no face-safe reveal/wearing/cat moment at quality 4+."];
  return plans.flatMap((p) => [
    `Short ${p.id} (${p.durationS}s, ${p.cuts.length} cuts): ${p.hook}`,
    ...p.cuts.map((c) => `  ${c.role === "hero" ? "hero   " : "lead-in"} ${c.clip} ${c.inS}-${c.outS}s [${c.shotType}]`),
  ]);
}

function runShorts(rest: string[]): void {
  const { flags } = parseArgs(rest);
  const momentsPath = flags.moments;
  const clipDir = flags["clip-dir"];
  const outDir = flags["out-dir"];
  if (!momentsPath || !clipDir || !outDir) {
    console.error(
      "Usage: cuesheet-draft shorts --moments <path> --clip-dir <source-folder> --out-dir <folder> [--max <n>] [--render] [--json]",
    );
    process.exit(1);
  }

  const momentsResult = momentsFileSchema.safeParse(JSON.parse(readFileSync(momentsPath, "utf-8")));
  if (!momentsResult.success) {
    console.error(`moments.json validation failed:\n${momentsResult.error.issues.map(formatIssue).join("\n")}`);
    process.exit(1);
  }

  const plans = planShorts(momentsResult.data, flags.max ? { maxShorts: Number(flags.max) } : {});
  mkdirSync(outDir, { recursive: true });
  const planPath = join(outDir, "shorts-plan.json");
  writeFileSync(planPath, JSON.stringify(plans, null, 2));
  for (const line of buildShortsReportLines(plans)) console.error(line);

  const outPaths: Record<string, string> = {};
  if (flags.render === "true") {
    for (const plan of plans) {
      const paths = plan.cuts.map((c) => join(clipDir, c.clip));
      // Same iCloud rule as scan: a not-downloaded placeholder (blocks===0) hangs on read, so
      // skip the whole Short rather than trigger a download.
      const missing = paths.filter((p) => !existsSync(p) || statSync(p).blocks === 0);
      if (missing.length > 0) {
        console.error(`Short ${plan.id} skipped: source not available locally (${missing.join(", ")})`);
        continue;
      }
      const outPath = join(outDir, `short-${plan.id}.mp4`);
      const cuts = plan.cuts.map((c, i) => {
        const path = paths[i] as string;
        return { path, inS: c.inS, outS: c.outS, hasAudio: hasAudioStream(path) };
      });
      execFileSync("ffmpeg", buildShortFfmpegArgs(cuts, outPath), { stdio: ["ignore", "ignore", "pipe"] });
      outPaths[plan.id] = outPath;
      console.error(`Short ${plan.id} rendered -> ${outPath}`);
    }
  }

  if (flags.json === "true") {
    console.log(JSON.stringify(buildShortsJsonResult(plans, planPath, outPaths)));
  }
}

function hasAudioStream(path: string): boolean {
  const out = execFileSync(
    "ffprobe",
    ["-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", path],
    { encoding: "utf-8" },
  );
  return out.trim().length > 0;
}

async function main(): Promise<void> {
  const [sub, ...rest] = process.argv.slice(2);
  if (sub === "scan") {
    await runScan(rest);
  } else if (sub === "assemble") {
    runAssemble(rest);
  } else if (sub === "shorts") {
    runShorts(rest);
  } else {
    console.error("Usage: cuesheet-draft <scan|assemble|shorts> ...");
    process.exit(1);
  }
}

// Only run when invoked directly as a CLI (not when this module is imported for its
// exported pure functions, e.g. buildScanJsonResult/buildAssembleJsonResult in tests).
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
