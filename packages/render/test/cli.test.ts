import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateCueSheet } from "@cuesheet/schema";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * End-to-end CLI wiring for `cuesheet-render --json`: spawns the actual built binary against a
 * synthetic clip (ffmpeg testsrc, same approach as draft's scan.test.ts) and checks that stdout
 * carries exactly one JSON line matching RenderJsonResult while human-readable progress stays on
 * stderr. --no-subtitles is used throughout so this doesn't depend on a fontconfig-enabled ffmpeg
 * build (see packages/render/README's Homebrew drawtext caveat).
 */
describe("cuesheet-render CLI --json", () => {
  const repoRoot = resolve(dirname(fileURLToPath(new URL(import.meta.url))), "../../..");
  const cliPath = resolve(repoRoot, "packages/render/dist/index.js");

  beforeAll(() => {
    if (!existsSync(cliPath)) {
      execFileSync("pnpm", ["--filter", "@cuesheet/render", "build"], { cwd: repoRoot, stdio: "ignore" });
    }
  });

  it("emits one JSON line (outputPath/durationS/srtPath) to stdout, human log to stderr", () => {
    const workDir = mkdtempSync(join(tmpdir(), "cuesheet-render-cli-"));
    try {
      // buildRenderPlan's filter graph always references an audio stream ([0:a]), so the
      // synthetic clip needs one too (testsrc alone is video-only).
      execFileSync(
        "ffmpeg",
        [
          "-y",
          "-f",
          "lavfi",
          "-i",
          "testsrc=duration=2:size=64x36:rate=10",
          "-f",
          "lavfi",
          "-i",
          "anullsrc=r=44100:cl=stereo:d=2",
          "-shortest",
          join(workDir, "a.mp4"),
        ],
        { stdio: "ignore" },
      );

      const validated = validateCueSheet({
        project: { name: "t", fps: 10, width: 64, height: 36 },
        clipDir: workDir,
        intro: null,
        outro: null,
        segments: [{ clip: "a.mp4", in: 0, out: 1, speed: 1, volume: 1, subtitle: "" }],
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
      if (!validated.ok) throw new Error(validated.errors.join("\n"));

      const cuePath = join(workDir, "in.cuesheet.json");
      writeFileSync(cuePath, JSON.stringify(validated.data));
      const outPath = join(workDir, "out.mp4");
      const srtPath = join(workDir, "out.srt");

      const result = spawnSync(
        "node",
        [cliPath, cuePath, outPath, "--no-subtitles", "--srt", srtPath, "--json"],
        { encoding: "utf-8" },
      );

      expect(result.status).toBe(0);
      expect(result.stderr).toContain("ffmpeg ");
      const stdoutLines = result.stdout.trim().split("\n").filter(Boolean);
      expect(stdoutLines).toHaveLength(1);
      const parsed = JSON.parse(stdoutLines[0] as string);
      // Pins the exact documented envelope (AGENTS.md / README): exactly these 3 keys, no more.
      expect(Object.keys(parsed).sort()).toEqual(["outputPath", "durationS", "srtPath"].sort());
      expect(parsed.outputPath).toBe(outPath);
      expect(parsed.srtPath).toBe(srtPath);
      expect(typeof parsed.durationS).toBe("number");
      expect(parsed.durationS).toBeGreaterThan(0);
      expect(existsSync(outPath)).toBe(true);
      expect(existsSync(srtPath)).toBe(true);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  }, 60_000);

  it("(no --json) still succeeds and emits no JSON on stdout", () => {
    const workDir = mkdtempSync(join(tmpdir(), "cuesheet-render-cli-human-"));
    try {
      execFileSync(
        "ffmpeg",
        [
          "-y",
          "-f",
          "lavfi",
          "-i",
          "testsrc=duration=2:size=64x36:rate=10",
          "-f",
          "lavfi",
          "-i",
          "anullsrc=r=44100:cl=stereo:d=2",
          "-shortest",
          join(workDir, "a.mp4"),
        ],
        { stdio: "ignore" },
      );

      const validated = validateCueSheet({
        project: { name: "t", fps: 10, width: 64, height: 36 },
        clipDir: workDir,
        intro: null,
        outro: null,
        segments: [{ clip: "a.mp4", in: 0, out: 1, speed: 1, volume: 1, subtitle: "" }],
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
      if (!validated.ok) throw new Error(validated.errors.join("\n"));

      const cuePath = join(workDir, "in.cuesheet.json");
      writeFileSync(cuePath, JSON.stringify(validated.data));
      const outPath = join(workDir, "out.mp4");

      const result = spawnSync("node", [cliPath, cuePath, outPath, "--no-subtitles"], {
        encoding: "utf-8",
      });

      expect(result.status).toBe(0);
      expect(result.stderr).toContain("ffmpeg ");
      expect(result.stdout.trim()).toBe("");
      expect(existsSync(outPath)).toBe(true);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  }, 60_000);

  it("--json fails on an invalid cuesheet: exit 1, field-path: reason on stderr, no stdout JSON", () => {
    const workDir = mkdtempSync(join(tmpdir(), "cuesheet-render-cli-invalid-"));
    try {
      // in >= out violates the segment schema's refine("in must be less than out").
      const invalidCue = {
        project: { name: "t", fps: 10, width: 64, height: 36 },
        clipDir: workDir,
        intro: null,
        outro: null,
        segments: [{ clip: "a.mp4", in: 5, out: 1, speed: 1, volume: 1, subtitle: "" }],
        bgm: [],
        subtitleStyle: {
          font: "Pretendard",
          size: 36,
          color: "#ffffff",
          outlineColor: "#000000",
          outlineWidth: 3,
          position: "bottom",
        },
      };
      const cuePath = join(workDir, "invalid.cuesheet.json");
      writeFileSync(cuePath, JSON.stringify(invalidCue));
      const outPath = join(workDir, "out.mp4");

      const result = spawnSync("node", [cliPath, cuePath, outPath, "--no-subtitles", "--json"], {
        encoding: "utf-8",
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Cuesheet validation failed");
      // field-path: reason format (e.g. "segments[0]: in must be less than out (in < out)")
      expect(result.stderr).toMatch(/segments\[0\].*: in must be less than out/);
      expect(result.stdout.trim()).toBe("");
      expect(existsSync(outPath)).toBe(false);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  }, 30_000);
});
