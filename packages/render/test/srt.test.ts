import { describe, expect, it } from "vitest";
import { validateCueSheet } from "@cuesheet/schema";
import type { CueSheet } from "@cuesheet/schema";
import { buildSrt, secondsToSrtTimestamp } from "../src/srt.js";

function make(overrides: Record<string, unknown> = {}): CueSheet {
  const base = {
    project: { name: "t", fps: 30, width: 1920, height: 1080 },
    clipDir: "/clips",
    intro: null,
    outro: null,
    segments: [
      { clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "안녕하세요" },
      { clip: "b.mp4", in: 2, out: 6, speed: 1.5, volume: 0.3, subtitle: "" },
      { clip: "c.mp4", in: 0, out: 4, speed: 2, volume: 1, subtitle: "빠른 컷: 100%" },
    ],
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

describe("secondsToSrtTimestamp", () => {
  it("converts to HH:MM:SS,mmm format", () => {
    expect(secondsToSrtTimestamp(0)).toBe("00:00:00,000");
    expect(secondsToSrtTimestamp(1.5)).toBe("00:00:01,500");
    expect(secondsToSrtTimestamp(3661.234)).toBe("01:01:01,234");
  });

  it("clamps negative values to 0", () => {
    expect(secondsToSrtTimestamp(-1)).toBe("00:00:00,000");
  });
});

describe("buildSrt", () => {
  it("skips segments with an empty subtitle and renumbers indices consecutively from the remaining cues", () => {
    const srt = buildSrt(make());
    const blocks = srt.split("\n\n");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toContain("1\n");
    expect(blocks[1]).toContain("2\n");
    expect(srt).not.toContain("b.mp4");
  });

  it("accumulates the output timeline reflecting speed ((out-in)/speed)", () => {
    const srt = buildSrt(make());
    // Segment 1: 0-5s (subtitle), segment 2: 5-7.667s (no subtitle, speed 1.5 -> 4/1.5=2.667s),
    // segment 3: 7.667-9.667s (subtitle, speed 2 -> 4/2=2s)
    expect(srt).toContain("00:00:00,000 --> 00:00:05,000");
    expect(srt).toContain("00:00:07,667 --> 00:00:09,667");
  });

  it("preserves special characters (colon etc.) as-is (SRT subtitle text needs no escaping)", () => {
    const srt = buildSrt(make());
    expect(srt).toContain("빠른 컷: 100%");
  });

  it("returns an empty string when every segment has an empty subtitle", () => {
    const cue = make({
      segments: [{ clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "" }],
    });
    expect(buildSrt(cue)).toBe("");
  });
});
