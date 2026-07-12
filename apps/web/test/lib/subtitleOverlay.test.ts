import { describe, expect, it } from "vitest";
import type { SubtitleStyle, SubtitleStylePresets } from "@cuesheet/schema";
import {
  mergeSubtitleStyle,
  subtitleBackgroundRgba,
  subtitleBackgroundPadding,
  subtitleOutlineStyle,
  subtitlePositionStyle,
  toColorInputValue,
  toCqw,
} from "../../src/lib/subtitleOverlay.js";

function baseStyle(overrides: Partial<SubtitleStyle> = {}): SubtitleStyle {
  return {
    font: "Pretendard",
    size: 48,
    color: "#ffffff",
    outlineColor: "#000000",
    outlineWidth: 3,
    position: "bottom",
    margin: 40,
    ...overrides,
  };
}

describe("mergeSubtitleStyle", () => {
  it("returns the global style unchanged when there is no preset or override", () => {
    const global = baseStyle();
    expect(mergeSubtitleStyle(global, undefined, null, null)).toEqual(global);
  });

  it("applies a named preset on top of the global style", () => {
    const global = baseStyle();
    const presets: SubtitleStylePresets = { shout: { size: 72 } };
    const result = mergeSubtitleStyle(global, presets, "shout", null);
    expect(result.size).toBe(72);
    expect(result.font).toBe(global.font);
  });

  it("ignores a stylePreset name that isn't in presets", () => {
    const global = baseStyle();
    const result = mergeSubtitleStyle(global, { shout: { size: 72 } }, "missing", null);
    expect(result).toEqual(global);
  });

  it("applies a segment override on top of both global and preset", () => {
    const global = baseStyle();
    const presets: SubtitleStylePresets = { shout: { size: 72, color: "#ff0000" } };
    const result = mergeSubtitleStyle(global, presets, "shout", { color: "#00ff00" });
    expect(result.size).toBe(72); // from preset
    expect(result.color).toBe("#00ff00"); // override wins over preset
  });

  it("override wins even without any preset applied", () => {
    const global = baseStyle();
    const result = mergeSubtitleStyle(global, undefined, null, { size: 20 });
    expect(result.size).toBe(20);
  });

  it("replaces background wholesale rather than merging it field-by-field", () => {
    const global = baseStyle({ background: { color: "#000000", opacity: 0.5, padding: 8 } });
    const result = mergeSubtitleStyle(global, undefined, null, {
      background: { color: "#ffffff", opacity: 1, padding: 20 },
    });
    expect(result.background).toEqual({ color: "#ffffff", opacity: 1, padding: 20 });
  });
});

describe("subtitleOutlineStyle", () => {
  it("returns an empty style object when width is 0", () => {
    expect(subtitleOutlineStyle(0, "0px", "#000000")).toEqual({});
  });

  it("returns an empty style object for a negative width", () => {
    expect(subtitleOutlineStyle(-1, "-1px", "#000000")).toEqual({});
  });

  it("produces a webkit text-stroke + paint-order for a positive width", () => {
    expect(subtitleOutlineStyle(3, "3px", "#000000")).toEqual({
      WebkitTextStroke: "3px #000000",
      paintOrder: "stroke",
    });
  });
});

describe("subtitleBackgroundRgba", () => {
  it("converts a 6-digit hex + opacity into rgba()", () => {
    expect(subtitleBackgroundRgba("#ff0000", 0.5)).toBe("rgba(255, 0, 0, 0.5)");
  });

  it("expands a 3-digit hex shorthand before converting", () => {
    expect(subtitleBackgroundRgba("#f00", 1)).toBe("rgba(255, 0, 0, 1)");
  });

  it("handles black/white boundaries", () => {
    expect(subtitleBackgroundRgba("#000000", 0)).toBe("rgba(0, 0, 0, 0)");
    expect(subtitleBackgroundRgba("#ffffff", 1)).toBe("rgba(255, 255, 255, 1)");
  });
});

describe("subtitlePositionStyle", () => {
  it("returns a top offset as a percentage of project height", () => {
    const style = baseStyle({ position: "top", margin: 108 });
    expect(subtitlePositionStyle(style, 1080)).toEqual({ top: "10%" });
  });

  it("returns a bottom offset as a percentage of project height", () => {
    const style = baseStyle({ position: "bottom", margin: 108 });
    expect(subtitlePositionStyle(style, 1080)).toEqual({ bottom: "10%" });
  });

  it("returns an empty object for center position (handled via CSS class instead)", () => {
    const style = baseStyle({ position: "center" });
    expect(subtitlePositionStyle(style, 1080)).toEqual({});
  });

  it("falls back to margin 40 when margin is missing (old cuesheet)", () => {
    const style = { ...baseStyle({ position: "bottom" }) };
    delete (style as Partial<SubtitleStyle>).margin;
    expect(subtitlePositionStyle(style, 1000)).toEqual({ bottom: "4%" });
  });

  it("guards against a zero/negative project height (division by zero)", () => {
    const style = baseStyle({ position: "bottom", margin: 40 });
    expect(subtitlePositionStyle(style, 0)).toEqual({ bottom: "4000%" });
  });
});

describe("toCqw", () => {
  it("converts a pixel value to a cqw percentage string of the reference width", () => {
    expect(toCqw(192, 1920)).toBe("10cqw");
  });

  it("guards against a zero reference width", () => {
    expect(toCqw(10, 0)).toBe("1000cqw");
  });
});

describe("toColorInputValue", () => {
  it("passes through an already-6-digit hex unchanged", () => {
    expect(toColorInputValue("#ff00aa")).toBe("#ff00aa");
  });

  it("expands a 3-digit shorthand to 6 digits", () => {
    expect(toColorInputValue("#f0a")).toBe("#ff00aa");
  });

  it("falls back to black for an unrecognized value", () => {
    expect(toColorInputValue("not-a-color")).toBe("#000000");
  });
});

describe("subtitleBackgroundPadding", () => {
  it("doubles the horizontal padding relative to the vertical (matches the render's boxborderw)", () => {
    expect(subtitleBackgroundPadding(2)).toBe("2px 4px");
    expect(subtitleBackgroundPadding(0)).toBe("0px 0px");
  });
});
