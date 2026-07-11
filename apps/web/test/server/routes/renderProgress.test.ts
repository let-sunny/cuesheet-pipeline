import { describe, expect, it } from "vitest";
import type { CueSheet } from "@cuesheet/schema";
import {
  estimateOutputSeconds,
  extractFfmpegErrorSummary,
  parseFfmpegTimeSeconds,
} from "../../../src/server/routes/renderProgress.js";
import { makeCueSheet } from "../../helpers/fixtures.js";

describe("extractFfmpegErrorSummary", () => {
  it("returns the matching fatal-error line found scanning from the end", () => {
    const stderr = [
      "ffmpeg version 6.0",
      "Input #0, ...",
      "Error while decoding stream #0:0",
      "frame= 10 fps=0.0 q=-1.0 size=0kB time=00:00:00.00 bitrate=N/A speed=0x",
    ].join("\n");

    expect(extractFfmpegErrorSummary(stderr)).toBe("Error while decoding stream #0:0");
  });

  it("matches 'No such file or directory'", () => {
    const stderr = "some/path: No such file or directory\n";
    expect(extractFfmpegErrorSummary(stderr)).toBe("some/path: No such file or directory");
  });

  it("falls back to the last non-empty line when nothing matches a known pattern", () => {
    const stderr = "line one\nline two\n\n";
    expect(extractFfmpegErrorSummary(stderr)).toBe("line two");
  });

  it("falls back to a generic message for empty/whitespace-only stderr", () => {
    expect(extractFfmpegErrorSummary("   \n  \n")).toBe("Unknown ffmpeg error");
  });
});

describe("parseFfmpegTimeSeconds", () => {
  it("parses an HH:MM:SS.ms time token into total seconds", () => {
    expect(parseFfmpegTimeSeconds("frame=1 time=01:02:03.50 bitrate=100kbits/s")).toBeCloseTo(3723.5);
  });

  it("returns null when no time= token is present", () => {
    expect(parseFfmpegTimeSeconds("frame=1 bitrate=100kbits/s")).toBeNull();
  });
});

describe("estimateOutputSeconds", () => {
  it("sums (out-in)/speed across segments", () => {
    const cue = makeCueSheet({
      segments: [
        { clip: "a.mp4", in: 0, out: 10, speed: 1, volume: 1, subtitle: "" },
        { clip: "b.mp4", in: 5, out: 15, speed: 2, volume: 1, subtitle: "" },
      ],
    });

    expect(estimateOutputSeconds(cue)).toBeCloseTo(10 + 5);
  });

  it("returns 0 for a cuesheet with no segments", () => {
    const cue = { ...makeCueSheet(), segments: [] } as CueSheet;
    expect(estimateOutputSeconds(cue)).toBe(0);
  });
});
