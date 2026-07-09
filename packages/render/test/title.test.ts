import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateCueSheet } from "@cuesheet/schema";
import {
  buildTitleAssContent,
  escapeFilterPath,
  formatAssTime,
  prepareTitleAssets,
  titleCacheKey,
} from "../src/title.js";

const project = { width: 1920, height: 1080, fps: 30 };

describe("titleCacheKey", () => {
  it("is stable for identical (text, preset, durationS, project) inputs", () => {
    const a = titleCacheKey({ text: "Cast on", preset: "gooey", durationS: 3 }, project);
    const b = titleCacheKey({ text: "Cast on", preset: "gooey", durationS: 3 }, project);
    expect(a).toBe(b);
  });

  it("differs when text, preset, duration, or project dimensions differ", () => {
    const base = titleCacheKey({ text: "Cast on", preset: "gooey", durationS: 3 }, project);
    expect(titleCacheKey({ text: "Bind off", preset: "gooey", durationS: 3 }, project)).not.toBe(base);
    expect(titleCacheKey({ text: "Cast on", preset: "particle", durationS: 3 }, project)).not.toBe(base);
    expect(titleCacheKey({ text: "Cast on", preset: "gooey", durationS: 4 }, project)).not.toBe(base);
    expect(titleCacheKey({ text: "Cast on", preset: "gooey", durationS: 3 }, { ...project, width: 1280 })).not.toBe(
      base,
    );
  });
});

describe("formatAssTime", () => {
  it("formats seconds as H:MM:SS.CC", () => {
    expect(formatAssTime(0)).toBe("0:00:00.00");
    expect(formatAssTime(3)).toBe("0:00:03.00");
    expect(formatAssTime(65.5)).toBe("0:01:05.50");
  });
});

describe("buildTitleAssContent", () => {
  it("includes PlayResX/Y, a per-character \\k karaoke reveal, and a whole-line \\fad", () => {
    const content = buildTitleAssContent(
      { text: "Cast on", preset: "typing", durationS: 3 },
      project,
    );
    expect(content).toContain("PlayResX: 1920");
    expect(content).toContain("PlayResY: 1080");
    expect(content).toContain("\\fad(");
    // 7 characters (including the space) -> 7 \k tags, one per character
    expect(content.match(/\\k\d+/g)?.length).toBe(7);
    for (const ch of "Cast on") {
      expect(content).toContain(ch);
    }
  });

  it("the per-character \\k durations sum to approximately the total duration in centiseconds", () => {
    const content = buildTitleAssContent({ text: "ABCD", preset: "typing", durationS: 2 }, project);
    const values = [...content.matchAll(/\\k(\d+)/g)].map((m) => Number(m[1]));
    const total = values.reduce((a, b) => a + b, 0);
    // 2s = 200cs, split across 4 characters = 50cs each -> total 200
    expect(total).toBeCloseTo(200, 0);
  });

  it("escapes literal braces in the title text (would otherwise be read as ASS override tags)", () => {
    const content = buildTitleAssContent({ text: "{oops}", preset: "typing", durationS: 1 }, project);
    // The literal braces from the title text must not survive (only the \k/\fad override tags'
    // own braces should remain) - each escaped '(' / ')' appears right after its own \k tag.
    expect(content).toContain("}({\\k");
    expect(content).toContain("}o{\\k");
    expect(content).toContain("})");
  });

  it("substitutes a literal backslash with the fullwidth reverse solidus (U+FF3C), not silent deletion", () => {
    // A raw ASCII "\" immediately before the next character's "{\k..}" block is read by libass as
    // the "\{" literal-left-brace escape, corrupting the following karaoke tag into literal text
    // (confirmed via a real render/frame-capture - see title.ts's escapeAssText doc comment).
    // U+FF3C has no special meaning to the ASS parser, so it survives the per-character wrapping
    // intact and renders as a visually-faithful backslash-like glyph.
    const content = buildTitleAssContent({ text: "a\\b", preset: "typing", durationS: 1 }, project);
    // No raw ASCII backslash immediately precedes a "{" (the exact pattern that corrupts the next
    // override tag) - the only backslashes left are the ASS override tags' own (\k, \fad).
    expect(content).not.toMatch(/\\\{/);
    expect(content).toContain("}a{");
    expect(content).toContain("}＼{");
    expect(content).toMatch(/\}b(\r?\n|$)/);
    // Every character (a, fullwidth backslash, b) still gets its own \k karaoke block.
    expect(content.match(/\\k\d+/g)?.length).toBe(3);
  });
});

describe("escapeFilterPath", () => {
  it("escapes backslash, colon, and single quote", () => {
    expect(escapeFilterPath("C:\\a'b.ass")).toBe("C\\:\\\\a\\'b.ass");
  });
});

describe("prepareTitleAssets - typing preset (no Playwright needed)", () => {
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

  it("writes an .ass file and returns a TitleAsset for a typing title, without touching Playwright", async () => {
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
            title: { text: "Cast on", preset: "typing", durationS: 2 },
          },
        ],
      });
      const assets = await prepareTitleAssets(cue, { cacheDir: workDir });
      expect(assets[0]?.kind).toBe("ass");
      if (assets[0]?.kind === "ass") {
        const content = readFileSync(assets[0].path, "utf-8");
        expect(content).toContain("PlayResX: 1920");
      }
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
