import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateCueSheet } from "../src/index.js";

const sample = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../examples/sample.cuesheet.json", import.meta.url)),
    "utf-8",
  ),
) as unknown;

describe("validateCueSheet - pass cases", () => {
  it("the example cuesheet passes validation", () => {
    const result = validateCueSheet(sample);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.segments).toHaveLength(3);
      expect(result.data.project.fps).toBe(30);
    }
  });

  it("defaults speed to 1.0 when unspecified", () => {
    const input = {
      ...(sample as Record<string, unknown>),
      segments: [{ clip: "a.mp4", in: 0, out: 1, subtitle: "" }],
    };
    const result = validateCueSheet(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.segments[0]?.speed).toBe(1.0);
    }
  });

  it("allows speed up to 16", () => {
    const input = {
      ...(sample as Record<string, unknown>),
      segments: [{ clip: "a.mp4", in: 0, out: 1, speed: 16, subtitle: "" }],
    };
    const result = validateCueSheet(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.segments[0]?.speed).toBe(16);
    }
  });

  it("an existing cuesheet without a narration field remains valid", () => {
    const result = validateCueSheet(sample);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.narration).toBeUndefined();
      expect(result.data.segments[0]?.narration).toBeUndefined();
    }
  });

  it("is valid when narration is enabled and a filename is present", () => {
    const input = {
      ...(sample as Record<string, unknown>),
      narration: { enabled: true, dir: "/narration", volume: 0.8 },
      segments: [
        { clip: "a.mp4", in: 0, out: 1, subtitle: "", narration: "line01.mp3" },
      ],
    };
    const result = validateCueSheet(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.narration).toEqual({ enabled: true, dir: "/narration", volume: 0.8 });
      expect(result.data.segments[0]?.narration).toBe("line01.mp3");
    }
  });

  it("passes and echoes back a valid crop (w===h matching project ratio)", () => {
    const input = {
      ...(sample as Record<string, unknown>),
      segments: [
        { clip: "a.mp4", in: 0, out: 1, subtitle: "", crop: { x: 0, y: 0.25, w: 0.75, h: 0.75 } },
      ],
    };
    const result = validateCueSheet(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.segments[0]?.crop).toEqual({ x: 0, y: 0.25, w: 0.75, h: 0.75 });
    }
  });

  it("fails when crop.w and crop.h mismatch (w!==h, not matching project ratio)", () => {
    const input = {
      ...(sample as Record<string, unknown>),
      segments: [
        { clip: "a.mp4", in: 0, out: 1, subtitle: "", crop: { x: 0, y: 0.25, w: 1, h: 0.75 } },
      ],
    };
    const result = validateCueSheet(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.startsWith("segments[0].crop:"))).toBe(true);
    }
  });

  it("an existing cuesheet without crop (omitted) remains valid", () => {
    const result = validateCueSheet(sample);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.segments[0]?.crop).toBeUndefined();
    }
  });

  it("an existing cuesheet without segment.styleOverride (omitted) remains valid", () => {
    const result = validateCueSheet(sample);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.segments[0]?.styleOverride).toBeUndefined();
    }
  });

  it("is valid when segment.styleOverride fills every field", () => {
    const input = {
      ...(sample as Record<string, unknown>),
      segments: [
        {
          clip: "a.mp4",
          in: 0,
          out: 1,
          subtitle: "",
          styleOverride: {
            font: "Pretendard",
            size: 60,
            color: "#ffff00",
            outlineColor: "#000000",
            outlineWidth: 4,
            position: "top",
            background: { color: "#000000", opacity: 0.5, padding: 10 },
            margin: 20,
          },
        },
      ],
    };
    const result = validateCueSheet(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.segments[0]?.styleOverride?.size).toBe(60);
      expect(result.data.segments[0]?.styleOverride?.position).toBe("top");
    }
  });

  it("holds only the given field when segment.styleOverride is partial (size only)", () => {
    const input = {
      ...(sample as Record<string, unknown>),
      segments: [
        { clip: "a.mp4", in: 0, out: 1, subtitle: "", styleOverride: { size: 72 } },
      ],
    };
    const result = validateCueSheet(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.segments[0]?.styleOverride).toEqual({ size: 72 });
    }
  });

  it("is valid when segment.styleOverride is null (treated as no override)", () => {
    const input = {
      ...(sample as Record<string, unknown>),
      segments: [{ clip: "a.mp4", in: 0, out: 1, subtitle: "", styleOverride: null }],
    };
    const result = validateCueSheet(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.segments[0]?.styleOverride).toBeNull();
    }
  });

  it("4K-preset-scaled margin/background.padding are valid too (relaxed caps: margin<=600, padding<=120)", () => {
    const input = {
      ...(sample as Record<string, unknown>),
      subtitleStyle: {
        font: "Pretendard",
        size: 108,
        color: "#ffffff",
        outlineColor: "#000000",
        outlineWidth: 12,
        position: "bottom",
        background: { color: "#000000", opacity: 0.75, padding: 24 },
        margin: 120,
      },
    };
    const result = validateCueSheet(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.subtitleStyle.margin).toBe(120);
      expect(result.data.subtitleStyle.background?.padding).toBe(24);
    }
  });

  it("an existing cuesheet without subtitleStylePresets/segment.stylePreset/segment.title/transitions/project fades remains valid", () => {
    const result = validateCueSheet(sample);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.subtitleStylePresets).toBeUndefined();
      expect(result.data.segments[0]?.stylePreset).toBeUndefined();
      expect(result.data.segments[0]?.title).toBeUndefined();
      expect(result.data.segments[0]?.transitionIn).toBeUndefined();
      expect(result.data.segments[0]?.transitionOut).toBeUndefined();
      expect(result.data.project.fadeInS).toBeUndefined();
      expect(result.data.project.fadeOutS).toBeUndefined();
    }
  });

  it("is valid when a segment's stylePreset references an existing subtitleStylePresets key", () => {
    const input = {
      ...(sample as Record<string, unknown>),
      subtitleStylePresets: { "inner-voice": { size: 32, color: "#cccccc" } },
      segments: [{ clip: "a.mp4", in: 0, out: 1, subtitle: "", stylePreset: "inner-voice" }],
    };
    const result = validateCueSheet(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.subtitleStylePresets?.["inner-voice"]).toEqual({ size: 32, color: "#cccccc" });
      expect(result.data.segments[0]?.stylePreset).toBe("inner-voice");
    }
  });

  it("fails when a segment's stylePreset references a name absent from subtitleStylePresets", () => {
    const input = {
      ...(sample as Record<string, unknown>),
      subtitleStylePresets: { shout: { size: 60 } },
      segments: [{ clip: "a.mp4", in: 0, out: 1, subtitle: "", stylePreset: "inner-voice" }],
    };
    const result = validateCueSheet(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.startsWith("segments[0].stylePreset:"))).toBe(true);
    }
  });

  it("fails when a segment's stylePreset is set but subtitleStylePresets is entirely absent", () => {
    const input = {
      ...(sample as Record<string, unknown>),
      segments: [{ clip: "a.mp4", in: 0, out: 1, subtitle: "", stylePreset: "shout" }],
    };
    const result = validateCueSheet(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.startsWith("segments[0].stylePreset:"))).toBe(true);
    }
  });

  it("is valid with a full title card (typing preset, explicit backdrop dim, color, size)", () => {
    const input = {
      ...(sample as Record<string, unknown>),
      segments: [
        {
          clip: "a.mp4",
          in: 0,
          out: 1,
          subtitle: "",
          title: {
            text: "Cast on",
            preset: "typing",
            durationS: 2.5,
            backdrop: { dim: 0.4 },
            color: "#ffffff",
            size: 90,
          },
        },
      ],
    };
    const result = validateCueSheet(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.segments[0]?.title).toEqual({
        text: "Cast on",
        preset: "typing",
        durationS: 2.5,
        backdrop: { dim: 0.4 },
        color: "#ffffff",
        size: 90,
      });
    }
  });

  it("defaults title.durationS/color/size when unspecified", () => {
    const input = {
      ...(sample as Record<string, unknown>),
      segments: [{ clip: "a.mp4", in: 0, out: 1, subtitle: "", title: { text: "Hi", preset: "fade" } }],
    };
    const result = validateCueSheet(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.segments[0]?.title?.durationS).toBe(3);
      expect(result.data.segments[0]?.title?.color).toBe("#ffffff");
      expect(result.data.segments[0]?.title?.size).toBe(100);
    }
  });

  it("fails when title.color is not a valid hex color", () => {
    const result = validateCueSheet({
      ...(sample as Record<string, unknown>),
      segments: [
        { clip: "a.mp4", in: 0, out: 1, subtitle: "", title: { text: "Hi", preset: "fade", color: "not-a-color" } },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.startsWith("segments[0].title.color:"))).toBe(true);
    }
  });

  it("fails when title.size is not positive", () => {
    const result = validateCueSheet({
      ...(sample as Record<string, unknown>),
      segments: [{ clip: "a.mp4", in: 0, out: 1, subtitle: "", title: { text: "Hi", preset: "fade", size: 0 } }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.startsWith("segments[0].title.size:"))).toBe(true);
    }
  });

  it("fails when title.preset is not one of the four closed presets", () => {
    const input = {
      ...(sample as Record<string, unknown>),
      segments: [{ clip: "a.mp4", in: 0, out: 1, subtitle: "", title: { text: "Hi", preset: "retro" } }],
    };
    const result = validateCueSheet(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.startsWith("segments[0].title.preset:"))).toBe(true);
    }
  });

  it("fails when title.text is empty or over 80 characters", () => {
    const tooLong = "a".repeat(81);
    const empty = validateCueSheet({
      ...(sample as Record<string, unknown>),
      segments: [{ clip: "a.mp4", in: 0, out: 1, subtitle: "", title: { text: "", preset: "typing" } }],
    });
    expect(empty.ok).toBe(false);
    const over = validateCueSheet({
      ...(sample as Record<string, unknown>),
      segments: [{ clip: "a.mp4", in: 0, out: 1, subtitle: "", title: { text: tooLong, preset: "typing" } }],
    });
    expect(over.ok).toBe(false);
  });

  it("fails when title.durationS is out of the 0.5-10 range", () => {
    const result = validateCueSheet({
      ...(sample as Record<string, unknown>),
      segments: [
        { clip: "a.mp4", in: 0, out: 1, subtitle: "", title: { text: "Hi", preset: "typing", durationS: 11 } },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("segments[0].title.durationS"))).toBe(true);
    }
  });

  it("fails when title.backdrop.dim is out of the 0-1 range", () => {
    const result = validateCueSheet({
      ...(sample as Record<string, unknown>),
      segments: [
        {
          clip: "a.mp4",
          in: 0,
          out: 1,
          subtitle: "",
          title: { text: "Hi", preset: "highlight", backdrop: { dim: 1.2 } },
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("segments[0].title.backdrop.dim"))).toBe(true);
    }
  });

  it("is valid when segment.title is null (treated as no title)", () => {
    const result = validateCueSheet({
      ...(sample as Record<string, unknown>),
      segments: [{ clip: "a.mp4", in: 0, out: 1, subtitle: "", title: null }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.segments[0]?.title).toBeNull();
    }
  });

  it("is valid with a fade transitionIn/transitionOut, defaulting durationS to 0.5", () => {
    const input = {
      ...(sample as Record<string, unknown>),
      segments: [
        {
          clip: "a.mp4",
          in: 0,
          out: 1,
          subtitle: "",
          transitionIn: { type: "fade" },
          transitionOut: { type: "fade", durationS: 1.2 },
        },
      ],
    };
    const result = validateCueSheet(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.segments[0]?.transitionIn).toEqual({ type: "fade", durationS: 0.5 });
      expect(result.data.segments[0]?.transitionOut).toEqual({ type: "fade", durationS: 1.2 });
    }
  });

  it("is valid with a dip transitionIn carrying an explicit dim", () => {
    const input = {
      ...(sample as Record<string, unknown>),
      segments: [
        {
          clip: "a.mp4",
          in: 0,
          out: 1,
          subtitle: "",
          transitionIn: { type: "dip", durationS: 0.8, dim: 0.6 },
        },
      ],
    };
    const result = validateCueSheet(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.segments[0]?.transitionIn).toEqual({ type: "dip", durationS: 0.8, dim: 0.6 });
    }
  });

  it("fails when transition.type is not fade or dip", () => {
    const result = validateCueSheet({
      ...(sample as Record<string, unknown>),
      segments: [{ clip: "a.mp4", in: 0, out: 1, subtitle: "", transitionIn: { type: "wipe" } }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.startsWith("segments[0].transitionIn.type:"))).toBe(true);
    }
  });

  it("fails when transition.durationS is out of the 0.2-2 range", () => {
    const tooShort = validateCueSheet({
      ...(sample as Record<string, unknown>),
      segments: [{ clip: "a.mp4", in: 0, out: 1, subtitle: "", transitionIn: { type: "fade", durationS: 0.1 } }],
    });
    expect(tooShort.ok).toBe(false);
    const tooLong = validateCueSheet({
      ...(sample as Record<string, unknown>),
      segments: [{ clip: "a.mp4", in: 0, out: 1, subtitle: "", transitionOut: { type: "fade", durationS: 2.1 } }],
    });
    expect(tooLong.ok).toBe(false);
    if (!tooLong.ok) {
      expect(tooLong.errors.some((e) => e.includes("segments[0].transitionOut.durationS"))).toBe(true);
    }
  });

  it("fails when transition.dim is out of the 0-1 range", () => {
    const result = validateCueSheet({
      ...(sample as Record<string, unknown>),
      segments: [
        { clip: "a.mp4", in: 0, out: 1, subtitle: "", transitionIn: { type: "dip", dim: 1.5 } },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("segments[0].transitionIn.dim"))).toBe(true);
    }
  });

  it("is valid when segment.transitionIn/transitionOut are null (treated as no transition)", () => {
    const result = validateCueSheet({
      ...(sample as Record<string, unknown>),
      segments: [{ clip: "a.mp4", in: 0, out: 1, subtitle: "", transitionIn: null, transitionOut: null }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.segments[0]?.transitionIn).toBeNull();
      expect(result.data.segments[0]?.transitionOut).toBeNull();
    }
  });

  it("is valid with project-level fadeInS/fadeOutS within 0-3", () => {
    const input = {
      ...(sample as Record<string, unknown>),
      project: { ...(sample as { project: object }).project, fadeInS: 1.5, fadeOutS: 3 },
    };
    const result = validateCueSheet(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.project.fadeInS).toBe(1.5);
      expect(result.data.project.fadeOutS).toBe(3);
    }
  });

  it("fails when project.fadeInS/fadeOutS are out of the 0-3 range", () => {
    const negative = validateCueSheet({
      ...(sample as Record<string, unknown>),
      project: { ...(sample as { project: object }).project, fadeInS: -1 },
    });
    expect(negative.ok).toBe(false);
    if (!negative.ok) {
      expect(negative.errors.some((e) => e.startsWith("project.fadeInS:"))).toBe(true);
    }
    const tooLarge = validateCueSheet({
      ...(sample as Record<string, unknown>),
      project: { ...(sample as { project: object }).project, fadeOutS: 3.5 },
    });
    expect(tooLarge.ok).toBe(false);
    if (!tooLarge.ok) {
      expect(tooLarge.errors.some((e) => e.startsWith("project.fadeOutS:"))).toBe(true);
    }
  });

  it("defaults narration.volume to 1.0 when unspecified", () => {
    const input = {
      ...(sample as Record<string, unknown>),
      narration: { enabled: true, dir: "/narration" },
    };
    const result = validateCueSheet(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.narration?.volume).toBe(1.0);
    }
  });

  it("an existing cuesheet without narration.ducking remains valid (additive-only field)", () => {
    const input = {
      ...(sample as Record<string, unknown>),
      narration: { enabled: true, dir: "/narration", volume: 0.8 },
    };
    const result = validateCueSheet(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.narration?.ducking).toBeUndefined();
    }
  });

  it("defaults narration.ducking.amount/fadeS when only the object is present", () => {
    const input = {
      ...(sample as Record<string, unknown>),
      narration: { enabled: true, dir: "/narration", ducking: {} },
    };
    const result = validateCueSheet(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.narration?.ducking).toEqual({ amount: 0.6, fadeS: 0.3 });
    }
  });

  it("accepts an explicit narration.ducking amount/fadeS", () => {
    const input = {
      ...(sample as Record<string, unknown>),
      narration: { enabled: true, dir: "/narration", ducking: { amount: 0.9, fadeS: 0.5 } },
    };
    const result = validateCueSheet(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.narration?.ducking).toEqual({ amount: 0.9, fadeS: 0.5 });
    }
  });
});

describe("validateCueSheet - failure cases", () => {
  it("gives a clear error when in >= out", () => {
    const bad = {
      ...(sample as Record<string, unknown>),
      segments: [{ clip: "a.mp4", in: 5, out: 3, speed: 1, subtitle: "" }],
    };
    const result = validateCueSheet(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("segments[0].in"))).toBe(true);
      expect(result.errors.some((e) => e.includes("in < out"))).toBe(true);
    }
  });

  it("fails when segments is empty", () => {
    const bad = { ...(sample as Record<string, unknown>), segments: [] };
    const result = validateCueSheet(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("at least 1"))).toBe(true);
    }
  });

  it("fails when speed is over 16", () => {
    const bad = {
      ...(sample as Record<string, unknown>),
      segments: [{ clip: "a.mp4", in: 0, out: 1, speed: 16.1, subtitle: "" }],
    };
    const result = validateCueSheet(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("segments[0].speed"))).toBe(true);
      expect(result.errors.some((e) => e.includes("speed must be <= 16"))).toBe(true);
    }
  });

  it("fails when volume is out of range", () => {
    const bad = {
      ...(sample as Record<string, unknown>),
      bgm: [{ file: "b.mp3", start: 0, end: 10, volume: 1.5 }],
    };
    const result = validateCueSheet(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("bgm[0].volume"))).toBe(true);
    }
  });

  it("fails when fps is negative", () => {
    const bad = {
      ...(sample as Record<string, unknown>),
      project: { name: "x", fps: -30, width: 1920, height: 1080 },
    };
    const result = validateCueSheet(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("project.fps"))).toBe(true);
    }
  });

  it("fails when narration.volume is out of range", () => {
    const bad = {
      ...(sample as Record<string, unknown>),
      narration: { enabled: true, dir: "/narration", volume: 1.5 },
    };
    const result = validateCueSheet(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("narration.volume"))).toBe(true);
    }
  });

  it("fails when narration.ducking.amount is out of range", () => {
    const bad = {
      ...(sample as Record<string, unknown>),
      narration: { enabled: true, dir: "/narration", ducking: { amount: 1.5 } },
    };
    const result = validateCueSheet(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("narration.ducking.amount"))).toBe(true);
    }
  });

  it("fails when narration.ducking.fadeS is below the minimum", () => {
    const bad = {
      ...(sample as Record<string, unknown>),
      narration: { enabled: true, dir: "/narration", ducking: { fadeS: 0.05 } },
    };
    const result = validateCueSheet(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("narration.ducking.fadeS"))).toBe(true);
    }
  });

  it("fails when crop is out of range (x+w>1)", () => {
    const bad = {
      ...(sample as Record<string, unknown>),
      segments: [
        { clip: "a.mp4", in: 0, out: 1, subtitle: "", crop: { x: 0.5, y: 0, w: 0.7, h: 0.5 } },
      ],
    };
    const result = validateCueSheet(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("segments[0].crop.x"))).toBe(true);
    }
  });

  it("fails when segment.styleOverride has an invalid color", () => {
    const bad = {
      ...(sample as Record<string, unknown>),
      segments: [
        { clip: "a.mp4", in: 0, out: 1, subtitle: "", styleOverride: { color: "not-a-hex" } },
      ],
    };
    const result = validateCueSheet(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("segments[0].styleOverride.color"))).toBe(
        true,
      );
    }
  });

  it("fails when segment.narration is an empty string", () => {
    const bad = {
      ...(sample as Record<string, unknown>),
      segments: [{ clip: "a.mp4", in: 0, out: 1, subtitle: "", narration: "" }],
    };
    const result = validateCueSheet(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("segments[0].narration"))).toBe(true);
    }
  });

  it("gives multiple errors when multiple fields are wrong at once", () => {
    const bad = {
      project: { name: "", fps: 0, width: -1, height: 0 },
      clipDir: "",
      intro: null,
      outro: null,
      segments: [],
      bgm: [],
      subtitleStyle: {
        font: "",
        size: 0,
        color: "not-a-hex",
        outlineColor: "#000",
        outlineWidth: -1,
        position: "middle",
      },
    };
    const result = validateCueSheet(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(3);
    }
  });

  it("fails when margin exceeds the cap (600)", () => {
    const input = {
      ...(sample as Record<string, unknown>),
      subtitleStyle: {
        font: "Pretendard",
        size: 48,
        color: "#ffffff",
        outlineColor: "#000000",
        outlineWidth: 2,
        position: "bottom",
        margin: 601,
      },
    };
    const result = validateCueSheet(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("margin"))).toBe(true);
    }
  });

  it("fails when background.padding exceeds the cap (120)", () => {
    const input = {
      ...(sample as Record<string, unknown>),
      subtitleStyle: {
        font: "Pretendard",
        size: 48,
        color: "#ffffff",
        outlineColor: "#000000",
        outlineWidth: 2,
        position: "bottom",
        background: { color: "#000000", opacity: 0.75, padding: 121 },
      },
    };
    const result = validateCueSheet(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("padding"))).toBe(true);
    }
  });
});

describe("validateCueSheet - repair hints (additive suffix, byte-stable field:reason prefix)", () => {
  it("appends a clamp hint when speed exceeds the inclusive max of 16", () => {
    const bad = {
      ...(sample as Record<string, unknown>),
      segments: [{ clip: "a.mp4", in: 0, out: 1, speed: 16.1, subtitle: "" }],
    };
    const result = validateCueSheet(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const line = result.errors.find((e) => e.startsWith("segments[0].speed:"));
      expect(line).toBe("segments[0].speed: speed must be <= 16 — clamp to 16");
    }
  });

  it("appends a clamp hint when volume exceeds the inclusive max of 1.0", () => {
    const bad = {
      ...(sample as Record<string, unknown>),
      bgm: [{ file: "b.mp3", start: 0, end: 10, volume: 1.5 }],
    };
    const result = validateCueSheet(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const line = result.errors.find((e) => e.startsWith("bgm[0].volume:"));
      expect(line).toContain(" — clamp to 1");
    }
  });

  it("appends a swap hint when in > out", () => {
    const bad = {
      ...(sample as Record<string, unknown>),
      segments: [{ clip: "a.mp4", in: 5, out: 3, speed: 1, subtitle: "" }],
    };
    const result = validateCueSheet(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const line = result.errors.find((e) => e.startsWith("segments[0].in:"));
      expect(line).toBe("segments[0].in: in must be less than out (in < out) — swap to in=3, out=5");
    }
  });

  it("appends a round-to-even hint when project.width is odd", () => {
    const bad = {
      ...(sample as Record<string, unknown>),
      project: { ...(sample as { project: Record<string, unknown> }).project, width: 1921 },
    };
    const result = validateCueSheet(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const line = result.errors.find((e) => e.startsWith("project.width:"));
      expect(line).toBe("project.width: must be even for video encoding — round to nearest even (1920 or 1922)");
    }
  });

  it("gives no hint for a shape error that needs human judgment (unknown stylePreset name)", () => {
    const bad = {
      ...(sample as Record<string, unknown>),
      subtitleStylePresets: { shout: { size: 60 } },
      segments: [{ clip: "a.mp4", in: 0, out: 1, subtitle: "", stylePreset: "inner-voice" }],
    };
    const result = validateCueSheet(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const line = result.errors.find((e) => e.startsWith("segments[0].stylePreset:"));
      expect(line).toBe(
        'segments[0].stylePreset: stylePreset "inner-voice" does not reference an existing preset name',
      );
    }
  });
});
