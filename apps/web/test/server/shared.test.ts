import { describe, expect, it } from "vitest";
import { contentDispositionHeader } from "../../src/server/shared.js";

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
