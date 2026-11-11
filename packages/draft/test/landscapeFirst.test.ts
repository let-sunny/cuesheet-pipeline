import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { validateCueSheet } from "@cuesheet/schema";
import { assembleDraft, DEFAULT_PORTRAIT_ROTATE, resolveClipRotate } from "../src/assemble.js";
import { isPortraitDisplay, scanFolder } from "../src/scan.js";
import { momentsFileSchema, type ClipMoments } from "../src/types.js";

function clip(name: string, rotate?: 90 | 270 | null): ClipMoments {
  return {
    clip: name,
    clipSummary: "summary",
    moments: [{ inS: 0, outS: 3, shotType: "object", memo: name, quality: 4 }],
    monotonousRanges: [],
    ...(rotate !== undefined ? { rotate } : {}),
  };
}

describe("isPortraitDisplay", () => {
  it("treats a 4K clip with quarter-turn rotation metadata as portrait", () => {
    expect(isPortraitDisplay(3840, 2160, -90)).toBe(true);
    expect(isPortraitDisplay(3840, 2160, 90)).toBe(true);
    expect(isPortraitDisplay(3840, 2160, 270)).toBe(true);
  });

  it("treats no rotation and a half turn as landscape", () => {
    expect(isPortraitDisplay(3840, 2160, 0)).toBe(false);
    expect(isPortraitDisplay(3840, 2160, -180)).toBe(false);
  });

  it("treats a tall coded frame without rotation as portrait, and a square one as landscape", () => {
    expect(isPortraitDisplay(1080, 1920, 0)).toBe(true);
    expect(isPortraitDisplay(2160, 2160, 0)).toBe(false);
  });

  it("falls back to landscape on a failed probe", () => {
    expect(isPortraitDisplay(Number.NaN, Number.NaN, 0)).toBe(false);
  });
});

describe("resolveClipRotate", () => {
  it("rotates an undecided portrait clip by the default", () => {
    expect(resolveClipRotate(undefined, true)).toBe(DEFAULT_PORTRAIT_ROTATE);
  });

  it("uses the vision judge's direction over the default", () => {
    expect(resolveClipRotate(90, true)).toBe(90);
  });

  it("keeps a genuinely upright clip vertical when the judge says null", () => {
    expect(resolveClipRotate(null, true)).toBeUndefined();
  });

  it("never rotates a landscape clip on the default alone", () => {
    expect(resolveClipRotate(undefined, false)).toBeUndefined();
  });
});

describe("assembleDraft landscape-first rotation", () => {
  const moments = [clip("a_topdown.mov"), clip("b_judged.mov", 90), clip("c_upright.mov", null), clip("d_landscape.mp4")];
  const cue = assembleDraft(moments, {
    clipDir: "/src",
    projectName: "landscape first",
    portraitClips: ["a_topdown.mov", "b_judged.mov", "c_upright.mov"],
  });
  const rotateOf = (name: string) => cue.segments?.filter((s) => s.clip === name).map((s) => s.rotate);

  it("puts the rotation on every segment of a portrait clip", () => {
    expect(rotateOf("a_topdown.mov")?.every((r) => r === DEFAULT_PORTRAIT_ROTATE)).toBe(true);
    expect(rotateOf("b_judged.mov")?.every((r) => r === 90)).toBe(true);
  });

  it("leaves upright and landscape clips without a rotate key", () => {
    for (const name of ["c_upright.mov", "d_landscape.mp4"]) {
      const segs = cue.segments?.filter((s) => s.clip === name) ?? [];
      expect(segs.length).toBeGreaterThan(0);
      expect(segs.every((s) => !("rotate" in s))).toBe(true);
    }
  });

  it("still produces a valid cuesheet", () => {
    expect(validateCueSheet(cue).ok).toBe(true);
  });

  it("changes nothing when no clip is portrait", () => {
    const plain = assembleDraft(moments.map((m) => clip(m.clip)), { clipDir: "/src", projectName: "plain" });
    expect(plain.segments?.every((s) => !("rotate" in s))).toBe(true);
  });
});

describe("momentsFileSchema rotate", () => {
  it("accepts 90, 270, null and omission, and rejects other values", () => {
    expect(momentsFileSchema.safeParse([clip("a.mov", 90), clip("b.mov", 270), clip("c.mov", null), clip("d.mov")]).success).toBe(true);
    expect(momentsFileSchema.safeParse([{ ...clip("e.mov"), rotate: 180 }]).success).toBe(false);
  });
});

describe("scanFolder portrait flag", () => {
  let srcDir: string;
  let workDir: string;

  beforeAll(() => {
    srcDir = mkdtempSync(join(tmpdir(), "cuesheet-draft-portrait-src-"));
    workDir = mkdtempSync(join(tmpdir(), "cuesheet-draft-portrait-work-"));
    const make = (filename: string, size: string) =>
      execFileSync("ffmpeg", ["-y", "-f", "lavfi", "-i", `testsrc=duration=3:size=${size}:rate=10`, join(srcDir, filename)], {
        stdio: "ignore",
      });
    make("wide.mp4", "64x36");
    make("tall.mp4", "36x64");
  });

  afterAll(() => {
    rmSync(srcDir, { recursive: true, force: true });
    rmSync(workDir, { recursive: true, force: true });
  });

  it("flags only the clip that displays taller than wide", async () => {
    const manifest = await scanFolder(srcDir, workDir);
    const byName = Object.fromEntries(manifest.clips.map((c) => [c.name, c]));
    expect(byName["tall.mp4"]?.portrait).toBe(true);
    expect(byName["wide.mp4"] && "portrait" in byName["wide.mp4"]).toBe(false);
  });
});
