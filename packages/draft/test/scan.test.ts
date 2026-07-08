import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scanFolder } from "../src/scan.js";

/**
 * scan.ts depends directly on real fs/ffprobe/ffmpeg, so this is an integration test using
 * a real temp folder + dummy video (can't be mocked). The goal is to verify the
 * case-insensitive extension matching regression.
 */

describe("scanFolder", () => {
  let srcDir: string;
  let workDir: string;

  beforeAll(() => {
    srcDir = mkdtempSync(join(tmpdir(), "cuesheet-draft-scan-src-"));
    workDir = mkdtempSync(join(tmpdir(), "cuesheet-draft-scan-work-"));

    const makeClip = (filename: string) => {
      execFileSync(
        "ffmpeg",
        ["-y", "-f", "lavfi", "-i", "testsrc=duration=3:size=64x36:rate=10", join(srcDir, filename)],
        { stdio: "ignore" },
      );
    };

    makeClip("lower.mp4");
    makeClip("UPPER.MP4");
  });

  afterAll(() => {
    rmSync(srcDir, { recursive: true, force: true });
    rmSync(workDir, { recursive: true, force: true });
  });

  it("includes both lowercase (.mp4) and uppercase (.MP4) extensions in the scan", async () => {
    const manifest = await scanFolder(srcDir, workDir);
    const names = manifest.clips.map((c) => c.name).sort();
    expect(names).toEqual(["UPPER.MP4", "lower.mp4"]);
    expect(manifest.evicted).toEqual([]);
    for (const clip of manifest.clips) {
      expect(clip.frames.length).toBeGreaterThan(0);
    }
  }, 30_000);
});
