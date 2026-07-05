#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { z } from "zod";
import { validateCueSheet } from "@cuesheet/schema";
import { assembleDraft } from "./assemble.js";
import { scanFolder } from "./scan.js";
import { momentsFileSchema } from "./types.js";

/**
 * CLI: cuesheet-draft scan <원본폴더> --out <작업폴더>
 *      cuesheet-draft assemble --manifest <경로> --moments <경로> --clip-dir <원본폴더>
 *                               --project-name <이름> --out <큐시트경로>
 *                               [--fps N] [--width N] [--height N]
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

/** zod issue path(예: [0,"moments",0,"quality"])를 "[0].moments[0].quality" 형태로 변환 */
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
    console.error("사용법: cuesheet-draft scan <원본폴더> --out <작업폴더>");
    process.exit(1);
  }

  mkdirSync(outDir, { recursive: true });
  const manifest = await scanFolder(srcDir, outDir);
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));

  const totalFrames = manifest.clips.reduce((n, c) => n + c.frames.length, 0);
  console.error(
    `스캔 완료: 로컬 ${manifest.clips.length}개 / 미다운로드 ${manifest.evicted.length}개, 프레임 ${totalFrames}장 -> ${join(outDir, "manifest.json")}`,
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
      "사용법: cuesheet-draft assemble --manifest <경로> --moments <경로> --clip-dir <원본폴더> --project-name <이름> --out <큐시트경로>",
    );
    process.exit(1);
  }

  // manifest.json은 scan 단계에서 실제 스캔된 클립 목록/프레임 정보를 담고 있다.
  // assemble 로직 자체는 moments.json만으로 충분하지만, 존재 확인 차 읽는다.
  JSON.parse(readFileSync(manifestPath, "utf-8"));

  const momentsRaw = JSON.parse(readFileSync(momentsPath, "utf-8"));
  const momentsResult = momentsFileSchema.safeParse(momentsRaw);
  if (!momentsResult.success) {
    console.error(`moments.json 검증 실패:\n${momentsResult.error.issues.map(formatIssue).join("\n")}`);
    process.exit(1);
  }

  const cueInput = assembleDraft(momentsResult.data, {
    clipDir,
    projectName,
    fps: flags.fps ? Number(flags.fps) : undefined,
    width: flags.width ? Number(flags.width) : undefined,
    height: flags.height ? Number(flags.height) : undefined,
  });

  const validated = validateCueSheet(cueInput);
  if (!validated.ok) {
    console.error(`큐시트 검증 실패:\n${validated.errors.join("\n")}`);
    process.exit(1);
  }

  writeFileSync(outPath, JSON.stringify(validated.data, null, 2));
  console.error(`조립 완료: 세그먼트 ${validated.data.segments.length}개 -> ${outPath}`);
}

async function main(): Promise<void> {
  const [sub, ...rest] = process.argv.slice(2);
  if (sub === "scan") {
    await runScan(rest);
  } else if (sub === "assemble") {
    runAssemble(rest);
  } else {
    console.error("사용법: cuesheet-draft <scan|assemble> ...");
    process.exit(1);
  }
}

main();
