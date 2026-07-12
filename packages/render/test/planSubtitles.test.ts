import { describe, expect, it } from "vitest";
import { validateCueSheet } from "@cuesheet/schema";
import type { CueSheet } from "@cuesheet/schema";
import { drawtextFilter, resolveSubtitleStyle, subtitleOverflowWarning } from "../src/planSubtitles.js";

function make(overrides: Record<string, unknown> = {}): CueSheet {
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
      margin: 40,
    },
  };
  const r = validateCueSheet({ ...base, ...overrides });
  if (!r.ok) throw new Error(r.errors.join("\n"));
  return r.data;
}

describe("resolveSubtitleStyle", () => {
  it("returns the global style when the segment has no preset or override", () => {
    const cue = make();
    const style = resolveSubtitleStyle(cue, cue.segments[0]!);
    expect(style).toEqual(cue.subtitleStyle);
  });

  it("layers a named preset over the global style", () => {
    const cue = make({
      subtitleStylePresets: { bold: { size: 72 } },
      segments: [{ clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "", stylePreset: "bold" }],
    });
    const style = resolveSubtitleStyle(cue, cue.segments[0]!);
    expect(style.size).toBe(72);
    expect(style.font).toBe(cue.subtitleStyle.font);
  });

  it("layers a per-cut styleOverride last, winning over the preset", () => {
    const cue = make({
      subtitleStylePresets: { bold: { size: 72 } },
      segments: [
        {
          clip: "a.mp4",
          in: 0,
          out: 5,
          speed: 1,
          volume: 1,
          subtitle: "",
          stylePreset: "bold",
          styleOverride: { size: 96 },
        },
      ],
    });
    const style = resolveSubtitleStyle(cue, cue.segments[0]!);
    expect(style.size).toBe(96);
  });

  it("falls back to the global style when stylePreset doesn't resolve to a preset (defensive branch - schema validation normally prevents this)", () => {
    const cue = make();
    const segment = { ...cue.segments[0]!, stylePreset: "missing" } as CueSheet["segments"][number];
    const style = resolveSubtitleStyle(cue, segment);
    expect(style).toEqual(cue.subtitleStyle);
  });
});

describe("drawtextFilter", () => {
  it("builds a drawtext filter string with size/color/outline/font", () => {
    const style = make().subtitleStyle;
    const filter = drawtextFilter("hello", style);
    expect(filter).toContain("drawtext=text='hello'");
    expect(filter).toContain(`fontsize=${style.size}`);
    expect(filter).toContain(`fontcolor=${style.color}`);
    expect(filter).toContain(`font='${style.font}'`);
  });

  it("escapes backslash, colon, single quote, and percent in the text", () => {
    const style = make().subtitleStyle;
    const filter = drawtextFilter(`a\\b:c'd%e`, style);
    expect(filter).toContain("text='a\\\\b\\:c\\'d\\%e'");
  });

  it("adds a box clause when a background is set", () => {
    const style = { ...make().subtitleStyle, background: { color: "#000000", opacity: 0.5, padding: 10 } };
    const filter = drawtextFilter("hi", style);
    expect(filter).toContain("box=1:boxcolor=#000000@0.5:boxborderw=10|20|10|20");
  });

  it("positions y at the margin for 'top'", () => {
    const style = { ...make().subtitleStyle, position: "top" as const, margin: 20 };
    expect(drawtextFilter("hi", style)).toContain(":y=20");
  });

  it("centers y for 'center'", () => {
    const style = { ...make().subtitleStyle, position: "center" as const };
    expect(drawtextFilter("hi", style)).toContain(":y=(h-text_h)/2");
  });

  it("positions y from the bottom margin for 'bottom' (the default)", () => {
    const style = { ...make().subtitleStyle, position: "bottom" as const, margin: 30 };
    expect(drawtextFilter("hi", style)).toContain(":y=h-text_h-30");
  });
});

describe("subtitleOverflowWarning", () => {
  it("returns null for empty text", () => {
    expect(subtitleOverflowWarning("", 48, 1920)).toBeNull();
  });

  it("returns null when the longest space-free run fits within the frame width", () => {
    expect(subtitleOverflowWarning("hello world", 48, 1920)).toBeNull();
  });

  it("warns with the run length when the longest space-free token would overflow the frame width", () => {
    const longToken = "a".repeat(100);
    const warning = subtitleOverflowWarning(longToken, 48, 1920);
    expect(warning).toContain("100-character run");
  });
});
