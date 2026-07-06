import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scanFolder } from "../src/scan.js";

/**
 * scan.ts는 실제 fs/ffprobe/ffmpeg에 직접 의존하므로, 실 임시 폴더 + 더미 영상으로
 * 통합 테스트한다(목킹 불가). 확장자 대소문자 무관 매칭 회귀 확인이 목적.
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

  it("소문자(.mp4)와 대문자(.MP4) 확장자를 모두 스캔 대상에 포함한다", async () => {
    const manifest = await scanFolder(srcDir, workDir);
    const names = manifest.clips.map((c) => c.name).sort();
    expect(names).toEqual(["UPPER.MP4", "lower.mp4"]);
    expect(manifest.evicted).toEqual([]);
    for (const clip of manifest.clips) {
      expect(clip.frames.length).toBeGreaterThan(0);
    }
  }, 30_000);
});
