import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateCueSheet } from "@cuesheet/schema";
import { beforeAll, describe, expect, it } from "vitest";
import { buildAssembleJsonResult, buildScanJsonResult } from "../src/cli.js";
import type { Manifest } from "../src/scan.js";
import type { ClipMoments } from "../src/types.js";

/**
 * Pure --json payload builders: fast, deterministic, no process/ffmpeg involved.
 */
describe("buildScanJsonResult", () => {
  it("counts clips/evicted/frames from a manifest", () => {
    const manifest: Manifest = {
      clips: [
        { name: "a.mp4", durS: 10, interval: 2, frames: [{ t: 0, path: "a" }, { t: 2, path: "b" }] },
        { name: "b.mp4", durS: 5, interval: 2, frames: [{ t: 0, path: "c" }] },
      ],
      evicted: ["c.mp4"],
    };
    expect(buildScanJsonResult(manifest, "/x/manifest.json")).toEqual({
      clips: 2,
      evicted: 1,
      frames: 3,
      manifestPath: "/x/manifest.json",
    });
  });
});

describe("buildAssembleJsonResult", () => {
  it("counts segments/connectors and sums output-timeline duration", () => {
    const r = validateCueSheet({
      project: { name: "t", fps: 30, width: 1280, height: 720 },
      clipDir: "/src",
      intro: null,
      outro: null,
      segments: [
        { clip: "a.mp4", in: 0, out: 3, speed: 1, volume: 1, subtitle: "1" },
        { clip: "a.mp4", in: 10, out: 40, speed: 14, volume: 1, subtitle: "(빨리감기)" },
      ],
      bgm: [],
      subtitleStyle: {
        font: "Pretendard",
        size: 36,
        color: "#ffffff",
        outlineColor: "#000000",
        outlineWidth: 3,
        position: "bottom",
      },
    });
    if (!r.ok) throw new Error(r.errors.join("\n"));
    const result = buildAssembleJsonResult(r.data, "/x/out.cuesheet.json");
    expect(result.segments).toBe(2);
    expect(result.connectors).toBe(1); // only the speed=14 segment
    expect(result.durationS).toBeCloseTo(3 + 30 / 14, 5);
    expect(result.validationOk).toBe(true);
    expect(result.outPath).toBe("/x/out.cuesheet.json");
  });
});

/**
 * End-to-end CLI wiring: spawns the actual built binary and checks --json output on stdout
 * is valid JSON matching the shape above, while human-readable logs stay on stderr.
 */
describe("cuesheet-draft CLI --json", () => {
  const repoRoot = resolve(dirname(fileURLToPath(new URL(import.meta.url))), "../../..");
  const cliPath = resolve(repoRoot, "packages/draft/dist/cli.js");

  beforeAll(() => {
    if (!existsSync(cliPath)) {
      execFileSync("pnpm", ["--filter", "@cuesheet/draft", "build"], { cwd: repoRoot, stdio: "ignore" });
    }
  });

  it("scan --json emits one JSON line to stdout, human log to stderr", () => {
    const srcDir = mkdtempSync(join(tmpdir(), "cuesheet-draft-cli-scan-src-"));
    const workDir = mkdtempSync(join(tmpdir(), "cuesheet-draft-cli-scan-work-"));
    try {
      execFileSync(
        "ffmpeg",
        ["-y", "-f", "lavfi", "-i", "testsrc=duration=2:size=64x36:rate=10", join(srcDir, "clip.mp4")],
        { stdio: "ignore" },
      );

      const result = spawnSync("node", [cliPath, "scan", srcDir, "--out", workDir, "--json"], {
        encoding: "utf-8",
      });

      expect(result.status).toBe(0);
      expect(result.stderr).toContain("Scan complete");
      const stdoutLines = result.stdout.trim().split("\n").filter(Boolean);
      expect(stdoutLines).toHaveLength(1);
      const parsed = JSON.parse(stdoutLines[0] as string);
      expect(parsed).toMatchObject({ clips: 1, evicted: 0 });
      expect(parsed.frames).toBeGreaterThan(0);
      expect(parsed.manifestPath).toContain("manifest.json");
    } finally {
      rmSync(srcDir, { recursive: true, force: true });
      rmSync(workDir, { recursive: true, force: true });
    }
  }, 30_000);

  it("assemble --json emits one JSON line to stdout, human log to stderr", () => {
    const workDir = mkdtempSync(join(tmpdir(), "cuesheet-draft-cli-assemble-"));
    try {
      const manifest: Manifest = {
        clips: [{ name: "a.mp4", durS: 20, interval: 5, frames: [] }],
        evicted: [],
      };
      const manifestPath = join(workDir, "manifest.json");
      writeFileSync(manifestPath, JSON.stringify(manifest));

      const moments: ClipMoments[] = [
        {
          clip: "a.mp4",
          clipSummary: "요약",
          moments: [{ inS: 2, outS: 5, shotType: "object", memo: "채택", quality: 5 }],
          monotonousRanges: [],
        },
      ];
      const momentsPath = join(workDir, "moments.json");
      writeFileSync(momentsPath, JSON.stringify(moments));

      const outPath = join(workDir, "out.cuesheet.json");
      const result = spawnSync(
        "node",
        [
          cliPath,
          "assemble",
          "--manifest",
          manifestPath,
          "--moments",
          momentsPath,
          "--clip-dir",
          "/src",
          "--project-name",
          "테스트",
          "--out",
          outPath,
          "--json",
        ],
        { encoding: "utf-8" },
      );

      expect(result.status).toBe(0);
      expect(result.stderr).toContain("Assembly complete");
      const stdoutLines = result.stdout.trim().split("\n").filter(Boolean);
      expect(stdoutLines).toHaveLength(1);
      const parsed = JSON.parse(stdoutLines[0] as string);
      expect(parsed).toMatchObject({ segments: 1, connectors: 0, validationOk: true, outPath });
      expect(parsed.durationS).toBeGreaterThan(0);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  }, 30_000);
});
