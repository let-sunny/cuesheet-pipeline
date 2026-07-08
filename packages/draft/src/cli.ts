#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { CueSheet } from "@cuesheet/schema";
import { formatIssue, validateCueSheet } from "@cuesheet/schema";
import { assembleDraft } from "./assemble.js";
import type { AssembleGrammarConfigOverride } from "./assemble.js";
import { scanFolder } from "./scan.js";
import type { Manifest } from "./scan.js";
import { momentsFileSchema } from "./types.js";

/**
 * CLI: cuesheet-draft scan <source-folder> --out <work-folder> [--json]
 *      cuesheet-draft assemble --manifest <path> --moments <path> --clip-dir <source-folder>
 *                               --project-name <name> --out <cuesheet-path>
 *                               [--fps N] [--width N] [--height N] [--boundary-pad N]
 *                               [--config <path>] [--json]
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
      "Usage: cuesheet-draft assemble --manifest <path> --moments <path> --clip-dir <source-folder> --project-name <name> --out <cuesheet-path> [--json]",
    );
    process.exit(1);
  }

  // manifest.json holds the list of actually scanned clips/frame info from the scan stage.
  // Extract per-clip durS and use it to clamp boundary padding so it doesn't extend past
  // the clip's end.
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as Manifest;
  const clipDurations = Object.fromEntries(manifest.clips.map((c) => [c.name, c.durS]));

  const momentsRaw = JSON.parse(readFileSync(momentsPath, "utf-8"));
  const momentsResult = momentsFileSchema.safeParse(momentsRaw);
  if (!momentsResult.success) {
    console.error(`moments.json validation failed:\n${momentsResult.error.issues.map(formatIssue).join("\n")}`);
    process.exit(1);
  }

  const config: AssembleGrammarConfigOverride | undefined = flags.config
    ? (JSON.parse(readFileSync(flags.config, "utf-8")) as AssembleGrammarConfigOverride)
    : undefined;

  const cueInput = assembleDraft(momentsResult.data, {
    clipDir,
    projectName,
    fps: flags.fps ? Number(flags.fps) : undefined,
    width: flags.width ? Number(flags.width) : undefined,
    height: flags.height ? Number(flags.height) : undefined,
    boundaryPadS: flags["boundary-pad"] ? Number(flags["boundary-pad"]) : undefined,
    clipDurations,
    config,
  });

  const validated = validateCueSheet(cueInput);
  if (!validated.ok) {
    console.error(`Cuesheet validation failed:\n${validated.errors.join("\n")}`);
    process.exit(1);
  }

  writeFileSync(outPath, JSON.stringify(validated.data, null, 2));
  console.error(`Assembly complete: ${validated.data.segments.length} segments -> ${outPath}`);

  if (flags.json === "true") {
    console.log(JSON.stringify(buildAssembleJsonResult(validated.data, outPath)));
  }
}

async function main(): Promise<void> {
  const [sub, ...rest] = process.argv.slice(2);
  if (sub === "scan") {
    await runScan(rest);
  } else if (sub === "assemble") {
    runAssemble(rest);
  } else {
    console.error("Usage: cuesheet-draft <scan|assemble> ...");
    process.exit(1);
  }
}

// Only run when invoked directly as a CLI (not when this module is imported for its
// exported pure functions, e.g. buildScanJsonResult/buildAssembleJsonResult in tests).
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
