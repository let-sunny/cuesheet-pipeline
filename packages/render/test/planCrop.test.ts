import { describe, expect, it } from "vitest";
import { validateCueSheet } from "@cuesheet/schema";
import type { CueSheet } from "@cuesheet/schema";
import { assertCropMatchesProjectAspect } from "../src/planCrop.js";

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
    },
  };
  const r = validateCueSheet({ ...base, ...overrides });
  if (!r.ok) throw new Error(r.errors.join("\n"));
  return r.data;
}

describe("assertCropMatchesProjectAspect", () => {
  // Note: cueSheetSchema's own superRefine already requires crop.w === crop.h (the "same-aspect
  // source" assumption for a crop that doesn't distort a project-aspect source) - the check under
  // test here is the separate, precise runtime check against the clip's ACTUAL probed dimensions,
  // which can still deviate when the real source isn't actually project-aspect.

  it("is a no-op when sourceDimensions is not provided", () => {
    const cue = make({
      segments: [{ clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "", crop: { x: 0, y: 0, w: 0.5, h: 0.5 } }],
    });
    expect(() => assertCropMatchesProjectAspect(cue)).not.toThrow();
  });

  it("is a no-op for a segment with no crop", () => {
    const cue = make();
    expect(() =>
      assertCropMatchesProjectAspect(cue, { "a.mp4": { width: 1920, height: 1080 } }),
    ).not.toThrow();
  });

  it("is a no-op when the clip has no matching sourceDimensions entry", () => {
    const cue = make({
      segments: [{ clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "", crop: { x: 0, y: 0, w: 0.2, h: 0.2 } }],
    });
    expect(() => assertCropMatchesProjectAspect(cue, {})).not.toThrow();
  });

  it("passes when the source's own aspect ratio matches the project's aspect ratio", () => {
    // project is 1920x1080 (16:9). Source is 3840x2160 (16:9) - same aspect, so any w===h crop
    // (guaranteed by schema validation) stays at the project's aspect ratio.
    const cue = make({
      segments: [{ clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "", crop: { x: 0, y: 0, w: 0.5, h: 0.5 } }],
    });
    expect(() =>
      assertCropMatchesProjectAspect(cue, { "a.mp4": { width: 3840, height: 2160 } }),
    ).not.toThrow();
  });

  it("throws a field-path style error naming the offending cut when the source's actual aspect ratio deviates from the project's", () => {
    // project is 16:9 (1920x1080, aspect 1.778). The clip's real source is square (1:1) - even
    // though crop.w===crop.h (schema-valid), the crop aspect equals the source aspect (1), which
    // deviates from the project's by far more than the 1% tolerance.
    const cue = make({
      segments: [{ clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "", crop: { x: 0, y: 0, w: 0.5, h: 0.5 } }],
    });
    expect(() => assertCropMatchesProjectAspect(cue, { "a.mp4": { width: 1000, height: 1000 } })).toThrow(
      /segments\[0\]\.crop: clip "a\.mp4"/,
    );
  });
});
