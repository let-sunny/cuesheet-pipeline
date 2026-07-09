import { describe, expect, it } from "vitest";
import { contentDispositionHeader, overallRenderProgress } from "../../src/server/shared.js";

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
