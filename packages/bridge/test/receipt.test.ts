import type { CueSheet } from "@cuesheet/schema";
import { describe, expect, it } from "vitest";
import { buildEditReceipt } from "../src/receipt.js";

function cue(overrides: Partial<CueSheet> = {}): CueSheet {
  return {
    project: { name: "t", fps: 30, width: 1920, height: 1080 },
    clipDir: "/x/clips",
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
    ...overrides,
  } as CueSheet;
}

describe("buildEditReceipt", () => {
  it("counts segments and sums output-timeline duration", () => {
    const r = buildEditReceipt(
      cue({
        segments: [
          { clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "" },
          { clip: "b.mp4", in: 10, out: 20, speed: 2, volume: 1, subtitle: "" },
        ],
      }),
    );
    expect(r.segmentCount).toBe(2);
    // (5-0)/1 + (20-10)/2 = 5 + 5 = 10
    expect(r.durationS).toBe(10);
    expect(r.warnings).toEqual([]);
  });

  it("warns when segments is empty", () => {
    const r = buildEditReceipt(cue({ segments: [] }));
    expect(r.segmentCount).toBe(0);
    expect(r.durationS).toBe(0);
    expect(r.warnings).toEqual(["segments is empty — the cuesheet has no content"]);
  });
});
