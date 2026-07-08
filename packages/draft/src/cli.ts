#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { z } from "zod";
import { validateCueSheet } from "@cuesheet/schema";
import { assembleDraft } from "./assemble.js";
import type { AssembleGrammarConfigOverride } from "./assemble.js";
import { scanFolder } from "./scan.js";
import type { Manifest } from "./scan.js";
import { momentsFileSchema } from "./types.js";

/**
 * CLI: cuesheet-draft scan <source-folder> --out <work-folder>
 *      cuesheet-draft assemble --manifest <path> --moments <path> --clip-dir <source-folder>
 *                               --project-name <name> --out <cuesheet-path>
 *                               [--fps N] [--width N] [--height N] [--boundary-pad N]
 *                               [--config <path>]
 *
 * --config <path>: JSON file with a partial AssembleGrammarConfig override (cut rhythm,
 * quality threshold, timelapse-connector rules, face-heuristic word lists, boundary pad).
 * Deep-merged onto DEFAULT_ASSEMBLE_CONFIG (the user's grammar) — omit for existing behavior.
 */

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

/** Converts a zod issue path (e.g. [0,"moments",0,"quality"]) to the form "[0].moments[0].quality" */
function pathToString(path: ReadonlyArray<PropertyKey>): string {
  let out = "";
  for (const key of path) {
    if (typeof key === "number") {
      out += `[${key}]`;
    } else {
      out += out ? `.${String(key)}` : String(key);
    }
  }
  return out || "(root)";
}

function formatIssue(issue: z.core.$ZodIssue): string {
  return `${pathToString(issue.path)}: ${issue.message}`;
}

async function runScan(rest: string[]): Promise<void> {
  const { positional, flags } = parseArgs(rest);
  const srcDir = positional[0];
  const outDir = flags.out;
  if (!srcDir || !outDir) {
    console.error("Usage: cuesheet-draft scan <source-folder> --out <work-folder>");
    process.exit(1);
  }

  mkdirSync(outDir, { recursive: true });
  const manifest = await scanFolder(srcDir, outDir);
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));

  const totalFrames = manifest.clips.reduce((n, c) => n + c.frames.length, 0);
  console.error(
    `Scan complete: ${manifest.clips.length} local / ${manifest.evicted.length} not downloaded, ${totalFrames} frames -> ${join(outDir, "manifest.json")}`,
  );
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
      "Usage: cuesheet-draft assemble --manifest <path> --moments <path> --clip-dir <source-folder> --project-name <name> --out <cuesheet-path>",
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

main();
