import { describe, expect, it } from "vitest";
import type { CueSheet } from "@cuesheet/schema";
import { scaleCueSheetForResolution } from "../../src/lib/subtitleScale.js";
import { makeCueSheet } from "../helpers/fixtures.js";

function withStyleOverride(sheet: CueSheet, override: NonNullable<CueSheet["segments"][number]["styleOverride"]>): CueSheet {
  return {
    ...sheet,
    segments: sheet.segments.map((s, i) => (i === 0 ? { ...s, styleOverride: override } : s)),
  };
}

describe("scaleCueSheetForResolution", () => {
  it("only changes project width/height when the height ratio is 1 (e.g. 1920x1080 -> 1280x1080 preset, same height)", () => {
    const sheet = makeCueSheet({ project: { name: "t", fps: 30, width: 1920, height: 1080 } });
    const result = scaleCueSheetForResolution(sheet, 1280, 1080);
    expect(result.project).toEqual({ name: "t", fps: 30, width: 1280, height: 1080 });
    expect(result.subtitleStyle).toEqual(sheet.subtitleStyle);
  });

  it("scales global subtitleStyle absolute px fields proportionally to the height ratio", () => {
    const sheet = makeCueSheet({
      project: { name: "t", fps: 30, width: 1920, height: 1080 },
      subtitleStyle: {
        font: "Pretendard",
        size: 48,
        color: "#ffffff",
        outlineColor: "#000000",
        outlineWidth: 3,
        position: "bottom",
        margin: 40,
      },
    });
    // 4K: height doubles (1080 -> 2160), scale = 2.
    const result = scaleCueSheetForResolution(sheet, 3840, 2160);
    expect(result.subtitleStyle.size).toBe(96);
    expect(result.subtitleStyle.outlineWidth).toBe(6);
    expect(result.subtitleStyle.margin).toBe(80);
  });

  it("clamps scaled margin to the schema max (600)", () => {
    const sheet = makeCueSheet({
      project: { name: "t", fps: 30, width: 1920, height: 1080 },
      subtitleStyle: {
        font: "Pretendard",
        size: 48,
        color: "#ffffff",
        outlineColor: "#000000",
        outlineWidth: 3,
        position: "bottom",
        margin: 400,
      },
    });
    // scale 2 would put margin at 800, clamped to 600.
    const result = scaleCueSheetForResolution(sheet, 3840, 2160);
    expect(result.subtitleStyle.margin).toBe(600);
  });

  it("clamps scaled margin to the schema min (8) when shrinking", () => {
    const sheet = makeCueSheet({
      project: { name: "t", fps: 30, width: 1920, height: 1080 },
      subtitleStyle: {
        font: "Pretendard",
        size: 48,
        color: "#ffffff",
        outlineColor: "#000000",
        outlineWidth: 3,
        position: "bottom",
        margin: 10,
      },
    });
    // 720p: height 1080 -> 720, scale = 2/3. 10 * 2/3 = 6.67 -> rounds to 7, clamped up to 8.
    const result = scaleCueSheetForResolution(sheet, 1280, 720);
    expect(result.subtitleStyle.margin).toBe(8);
  });

  it("scales background.padding and clamps it to the schema range [0,120]", () => {
    const sheet = makeCueSheet({
      project: { name: "t", fps: 30, width: 1920, height: 1080 },
      subtitleStyle: {
        font: "Pretendard",
        size: 48,
        color: "#ffffff",
        outlineColor: "#000000",
        outlineWidth: 3,
        position: "bottom",
        margin: 40,
        background: { color: "#000000", opacity: 0.5, padding: 80 },
      },
    });
    const result = scaleCueSheetForResolution(sheet, 3840, 2160);
    // 80 * 2 = 160, clamped to 120.
    expect(result.subtitleStyle.background?.padding).toBe(120);
  });

  it("leaves segments without a styleOverride untouched", () => {
    const sheet = makeCueSheet({ project: { name: "t", fps: 30, width: 1920, height: 1080 } });
    const result = scaleCueSheetForResolution(sheet, 3840, 2160);
    expect(result.segments[0]?.styleOverride).toBeUndefined();
  });

  it("scales only the fields actually set on a segment's styleOverride, leaving others untouched", () => {
    const sheet = withStyleOverride(
      makeCueSheet({ project: { name: "t", fps: 30, width: 1920, height: 1080 } }),
      { size: 30 },
    );
    const result = scaleCueSheetForResolution(sheet, 3840, 2160);
    expect(result.segments[0]?.styleOverride).toEqual({ size: 60 });
  });

  it("scales a styleOverride's background.padding too, independent of the global background", () => {
    const sheet = withStyleOverride(
      makeCueSheet({ project: { name: "t", fps: 30, width: 1920, height: 1080 } }),
      { background: { color: "#111111", opacity: 0.3, padding: 10 } },
    );
    const result = scaleCueSheetForResolution(sheet, 3840, 2160);
    expect(result.segments[0]?.styleOverride?.background).toEqual({
      color: "#111111",
      opacity: 0.3,
      padding: 20,
    });
  });
});
