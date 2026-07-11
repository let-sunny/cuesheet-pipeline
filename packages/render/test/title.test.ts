import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateCueSheet } from "@cuesheet/schema";
import { normalizeFrameFilenames, prepareTitleAssets, titleCacheKey } from "../src/title.js";

const project = { width: 1920, height: 1080, fps: 30 };

describe("titleCacheKey", () => {
  it("is stable for identical (text, preset, durationS, project) inputs", () => {
    const a = titleCacheKey({ text: "Cast on", preset: "fade", durationS: 3 }, project);
    const b = titleCacheKey({ text: "Cast on", preset: "fade", durationS: 3 }, project);
    expect(a).toBe(b);
  });

  it("differs when text, preset, duration, or project dimensions differ", () => {
    const base = titleCacheKey({ text: "Cast on", preset: "fade", durationS: 3 }, project);
    expect(titleCacheKey({ text: "Bind off", preset: "fade", durationS: 3 }, project)).not.toBe(base);
    expect(titleCacheKey({ text: "Cast on", preset: "highlight", durationS: 3 }, project)).not.toBe(base);
    expect(titleCacheKey({ text: "Cast on", preset: "fade", durationS: 4 }, project)).not.toBe(base);
    expect(titleCacheKey({ text: "Cast on", preset: "fade", durationS: 3 }, { ...project, width: 1280 })).not.toBe(
      base,
    );
  });
});

describe("normalizeFrameFilenames", () => {
  function writeFrames(dir: string, names: string[]) {
    mkdirSync(dir, { recursive: true });
    for (const name of names) {
      writeFileSync(join(dir, name), "fake-png-bytes");
    }
  }

  it("renames Remotion's own narrow zero-padding into frame_%04d.png by position", async () => {
    const workDir = mkdtempSync(join(tmpdir(), "title-normalize-"));
    try {
      const rawDir = join(workDir, "_raw");
      const finalDir = join(workDir, "final");
      mkdirSync(finalDir, { recursive: true });
      // A 3-frame render pads to 1 digit (String(3-1).length === 1 per @remotion/renderer's
      // getFilePadLength) - deliberately narrower than our own 4-digit contract.
      writeFrames(rawDir, ["element-0.png", "element-1.png", "element-2.png"]);

      await normalizeFrameFilenames(rawDir, finalDir, 3);

      expect(readFileSync(join(finalDir, "frame_0000.png"), "utf-8")).toBe("fake-png-bytes");
      expect(readFileSync(join(finalDir, "frame_0001.png"), "utf-8")).toBe("fake-png-bytes");
      expect(readFileSync(join(finalDir, "frame_0002.png"), "utf-8")).toBe("fake-png-bytes");
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });

  it("ignores non-png files (e.g. a stray meta.json) when counting/sorting", async () => {
    const workDir = mkdtempSync(join(tmpdir(), "title-normalize-"));
    try {
      const rawDir = join(workDir, "_raw");
      const finalDir = join(workDir, "final");
      mkdirSync(finalDir, { recursive: true });
      writeFrames(rawDir, ["element-00.png", "element-01.png"]);
      writeFileSync(join(rawDir, "meta.json"), "{}");

      await normalizeFrameFilenames(rawDir, finalDir, 2);

      expect(readFileSync(join(finalDir, "frame_0000.png"), "utf-8")).toBe("fake-png-bytes");
      expect(readFileSync(join(finalDir, "frame_0001.png"), "utf-8")).toBe("fake-png-bytes");
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });

  it("throws when the produced frame count doesn't match the expected frameCount", async () => {
    const workDir = mkdtempSync(join(tmpdir(), "title-normalize-"));
    try {
      const rawDir = join(workDir, "_raw");
      const finalDir = join(workDir, "final");
      mkdirSync(finalDir, { recursive: true });
      writeFrames(rawDir, ["element-0.png", "element-1.png"]);

      await expect(normalizeFrameFilenames(rawDir, finalDir, 3, "Cast on")).rejects.toThrow(
        /Cast on/,
      );
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });
});

describe("prepareTitleAssets - cache-hit path (no Remotion/browser touched)", () => {
  function make(overrides: Record<string, unknown> = {}) {
    const base = {
      project: { name: "t", fps: 30, width: 1920, height: 1080 },
      clipDir: "/clips",
      intro: null,
      outro: null,
      segments: [{ clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "" }],
      bgm: [],
      subtitleStyle: {
        font: "Pretendard",
        size: 48,
        color: "#ffffff",
        outlineColor: "#000000",
        outlineWidth: 3,
        position: "bottom",
      },
    };
    const r = validateCueSheet({ ...base, ...overrides });
    if (!r.ok) throw new Error(r.errors.join("\n"));
    return r.data;
  }

  it("returns the cached TitleFramesAsset straight from meta.json, without bundling/rendering", async () => {
    const workDir = mkdtempSync(join(tmpdir(), "title-cache-"));
    try {
      const cue = make({
        segments: [
          {
            clip: "a.mp4",
            in: 0,
            out: 5,
            speed: 1,
            volume: 1,
            subtitle: "",
            title: { text: "Cast on", preset: "fade", durationS: 2 },
          },
        ],
      });
      const key = titleCacheKey(cue.segments[0]!.title!, cue.project);
      const frameCount = Math.round(2 * 30);
      const dir = join(workDir, key);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "meta.json"), JSON.stringify({ frameCount, fps: 30 }));

      const assets = await prepareTitleAssets(cue, { cacheDir: workDir });
      expect(assets[0]).toEqual({ kind: "frames", dir, frameCount, fps: 30 });
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });

  it("returns an empty map when no segment has a title", async () => {
    const workDir = mkdtempSync(join(tmpdir(), "title-cache-"));
    try {
      const assets = await prepareTitleAssets(make(), { cacheDir: workDir });
      expect(Object.keys(assets)).toHaveLength(0);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });
});

/**
 * A real end-to-end capture (Chrome Headless Shell download + webpack bundle + actual frame
 * render) is deliberately NOT exercised in this unit suite - too slow/environment-dependent for a
 * fast test run. normalizeFrameFilenames above covers the one genuinely risky piece of logic
 * (Remotion's own filename/padding scheme never matching our frame_%04d.png contract) in
 * isolation. A real render was verified manually - see docs/STATUS.md's Remotion entry for whether
 * that verification ran in this environment.
 */
