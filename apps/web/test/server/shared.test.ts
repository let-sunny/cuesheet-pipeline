import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { contentDispositionHeader, isWithin, listVideoFilesRecursive, overallRenderProgress } from "../../src/server/shared.js";

describe("contentDispositionHeader", () => {
  it("carries both the plain ascii filename and the RFC 5987 filename* variant for an ascii project name", () => {
    const header = contentDispositionHeader("export.mp4", "my-project.mp4");

    expect(header).toContain('filename="export.mp4"');
    expect(header).toContain(`filename*=UTF-8''${encodeURIComponent("my-project.mp4")}`);
  });

  it("URI-encodes a unicode (e.g. Korean) project name in the filename* variant, keeping the ascii fallback plain", () => {
    const header = contentDispositionHeader("subtitles.srt", "닷믹스베스트.srt");

    expect(header).toContain('filename="subtitles.srt"');
    expect(header).toContain(`filename*=UTF-8''${encodeURIComponent("닷믹스베스트.srt")}`);
    expect(header).not.toContain("닷믹스베스트");
  });
});

describe("isWithin", () => {
  it("accepts root itself and a direct child", () => {
    expect(isWithin("/a/b", "/a/b")).toBe(true);
    expect(isWithin("/a/b", "/a/b/c.mp4")).toBe(true);
  });

  it("accepts a nested event-subfolder path", () => {
    expect(isWithin("/a/b", "/a/b/001_label_260609/clip.mp4")).toBe(true);
  });

  it("rejects a path outside root, including a same-prefix sibling directory", () => {
    expect(isWithin("/a/b", "/a/other")).toBe(false);
    expect(isWithin("/a/b", "/a/bcd/clip.mp4")).toBe(false);
    expect(isWithin("/a/b", "/a")).toBe(false);
  });
});

describe("listVideoFilesRecursive", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "cuesheet-web-list-videos-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("recurses into event-subfolders (raw-footage-sorting convention), keeping the relative path as the name", async () => {
    mkdirSync(join(dir, "001_label_260609"), { recursive: true });
    writeFileSync(join(dir, "001_label_260609", "clip.mp4"), "");
    writeFileSync(join(dir, "top.mov"), "");

    const files = (await listVideoFilesRecursive(dir)).sort();
    expect(files).toEqual(["001_label_260609/clip.mp4", "top.mov"]);
  });

  it("skips _-prefixed and .-prefixed directories", async () => {
    mkdirSync(join(dir, "_미리보기"), { recursive: true });
    writeFileSync(join(dir, "_미리보기", "preview.mp4"), "");
    mkdirSync(join(dir, ".hidden"), { recursive: true });
    writeFileSync(join(dir, ".hidden", "ignored.mp4"), "");
    writeFileSync(join(dir, "visible.mp4"), "");

    const files = await listVideoFilesRecursive(dir);
    expect(files).toEqual(["visible.mp4"]);
  });

  it("ignores non-video files", async () => {
    writeFileSync(join(dir, "notes.txt"), "");
    writeFileSync(join(dir, "clip.mp4"), "");

    const files = await listVideoFilesRecursive(dir);
    expect(files).toEqual(["clip.mp4"]);
  });
});

describe("overallRenderProgress", () => {
  it("maps a single-command render to the plain percentage", () => {
    expect(overallRenderProgress(0, 1, 0.5)).toBe(50);
  });

  it("caps at 99 until the final exit code declares done", () => {
    expect(overallRenderProgress(0, 1, 1)).toBe(99);
    expect(overallRenderProgress(1, 2, 1)).toBe(99);
  });

  it("gives each pass of a two-pass render an equal slice", () => {
    expect(overallRenderProgress(0, 2, 0.5)).toBe(25);
    expect(overallRenderProgress(1, 2, 0)).toBe(50);
    expect(overallRenderProgress(1, 2, 0.5)).toBe(75);
  });

  it("clamps a within value that overshoots the probed duration", () => {
    expect(overallRenderProgress(0, 2, 1.4)).toBe(50);
    expect(overallRenderProgress(0, 2, -0.1)).toBe(0);
  });
});
