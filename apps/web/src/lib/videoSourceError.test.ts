import { describe, expect, it } from "vitest";
import { classifyVideoSourceError, videoSourceErrorMessage } from "./videoSourceError.js";

describe("classifyVideoSourceError", () => {
  it("classifies as missing when the supplementary fetch failed (404, etc.)", () => {
    expect(classifyVideoSourceError(false)).toBe("missing");
  });

  it("classifies as undecodable when the supplementary fetch succeeded (file exists, just unplayable)", () => {
    expect(classifyVideoSourceError(true)).toBe("undecodable");
  });
});

describe("videoSourceErrorMessage", () => {
  it("gives a 'can't find the source' message (with the filename) for missing", () => {
    expect(videoSourceErrorMessage("missing", "cut_01.mp4")).toBe("Can't find the source: cut_01.mp4");
  });

  it("falls back to '(no filename)' for missing with an empty clip", () => {
    expect(videoSourceErrorMessage("missing", "")).toBe("Can't find the source: (no filename)");
  });

  it("gives a distinct 're-export or replace' message for undecodable, different from missing", () => {
    const message = videoSourceErrorMessage("undecodable", "fake.mp4");
    expect(message).not.toContain("Can't find the source");
    expect(message).toMatch(/can't be played as video/);
  });
});
