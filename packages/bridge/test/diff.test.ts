import type { CueSheet, Segment } from "@cuesheet/schema";
import { describe, expect, it } from "vitest";
import { buildCuesheetDiff } from "../src/diff.js";

function segment(overrides: Partial<Segment> = {}): Segment {
  return { clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "", ...overrides };
}

function cue(overrides: Partial<CueSheet> = {}): CueSheet {
  return {
    project: { name: "t", fps: 30, width: 1920, height: 1080 },
    clipDir: "/x/clips",
    intro: null,
    outro: null,
    segments: [segment()],
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

describe("buildCuesheetDiff", () => {
  it("reports no changes for an identical cuesheet", () => {
    const a = cue();
    const b = cue();
    const diff = buildCuesheetDiff(a, b);
    expect(diff).toEqual({
      durationDeltaS: 0,
      segments: {
        added: [],
        addedTotal: 0,
        removed: [],
        removedTotal: 0,
        modified: [],
        modifiedTotal: 0,
        reordered: false,
      },
      project: [],
      bgm: { added: 0, removed: 0, modified: 0 },
      narration: { changed: false, fields: [] },
    });
  });

  it("detects an added segment", () => {
    const before = cue({ segments: [segment({ clip: "a.mp4", in: 0, out: 5 })] });
    const after = cue({
      segments: [
        segment({ clip: "a.mp4", in: 0, out: 5 }),
        segment({ clip: "b.mp4", in: 0, out: 10 }),
      ],
    });
    const diff = buildCuesheetDiff(before, after);
    expect(diff.segments.addedTotal).toBe(1);
    expect(diff.segments.added).toEqual([{ index: 1, clip: "b.mp4", in: 0, out: 10 }]);
    expect(diff.segments.removedTotal).toBe(0);
    expect(diff.segments.modifiedTotal).toBe(0);
    expect(diff.segments.reordered).toBe(false);
    expect(diff.durationDeltaS).toBe(10); // +10s from the new segment
  });

  it("detects a removed segment", () => {
    const before = cue({
      segments: [
        segment({ clip: "a.mp4", in: 0, out: 5 }),
        segment({ clip: "b.mp4", in: 0, out: 10 }),
      ],
    });
    const after = cue({ segments: [segment({ clip: "a.mp4", in: 0, out: 5 })] });
    const diff = buildCuesheetDiff(before, after);
    expect(diff.segments.removedTotal).toBe(1);
    expect(diff.segments.removed).toEqual([{ index: 1, clip: "b.mp4", in: 0, out: 10 }]);
    expect(diff.segments.addedTotal).toBe(0);
    expect(diff.durationDeltaS).toBe(-10);
  });

  it("detects a modified segment (same clip+in/out, other fields changed)", () => {
    const before = cue({ segments: [segment({ clip: "a.mp4", in: 0, out: 5, volume: 1 })] });
    const after = cue({
      segments: [segment({ clip: "a.mp4", in: 0, out: 5, volume: 0.3, subtitle: "hi" })],
    });
    const diff = buildCuesheetDiff(before, after);
    expect(diff.segments.addedTotal).toBe(0);
    expect(diff.segments.removedTotal).toBe(0);
    expect(diff.segments.modifiedTotal).toBe(1);
    expect(diff.segments.modified).toEqual([
      {
        index: 0,
        clip: "a.mp4",
        changes: [
          { field: "volume", before: 1, after: 0.3 },
          { field: "subtitle", before: "", after: "hi" },
        ],
      },
    ]);
  });

  it("detects a reorder — same segments (by clip+in/out), different relative order", () => {
    const before = cue({
      segments: [
        segment({ clip: "a.mp4", in: 0, out: 5 }),
        segment({ clip: "b.mp4", in: 0, out: 5 }),
      ],
    });
    const after = cue({
      segments: [
        segment({ clip: "b.mp4", in: 0, out: 5 }),
        segment({ clip: "a.mp4", in: 0, out: 5 }),
      ],
    });
    const diff = buildCuesheetDiff(before, after);
    expect(diff.segments.addedTotal).toBe(0);
    expect(diff.segments.removedTotal).toBe(0);
    expect(diff.segments.modifiedTotal).toBe(0);
    expect(diff.segments.reordered).toBe(true);
    expect(diff.durationDeltaS).toBe(0);
  });

  it("does not flag a reorder when segments are only appended (order among existing ones unchanged)", () => {
    const before = cue({
      segments: [
        segment({ clip: "a.mp4", in: 0, out: 5 }),
        segment({ clip: "b.mp4", in: 0, out: 5 }),
      ],
    });
    const after = cue({
      segments: [
        segment({ clip: "a.mp4", in: 0, out: 5 }),
        segment({ clip: "b.mp4", in: 0, out: 5 }),
        segment({ clip: "c.mp4", in: 0, out: 5 }),
      ],
    });
    const diff = buildCuesheetDiff(before, after);
    expect(diff.segments.reordered).toBe(false);
    expect(diff.segments.addedTotal).toBe(1);
  });

  it("caps the modified list at 5 entries but reports the true total", () => {
    const clips = Array.from({ length: 7 }, (_, i) => `clip-${i}.mp4`);
    const before = cue({ segments: clips.map((clip) => segment({ clip, volume: 1 })) });
    const after = cue({ segments: clips.map((clip) => segment({ clip, volume: 0.5 })) });
    const diff = buildCuesheetDiff(before, after);
    expect(diff.segments.modifiedTotal).toBe(7);
    expect(diff.segments.modified).toHaveLength(5);
  });

  it("reports project-level field changes", () => {
    const before = cue();
    const after = cue({
      project: { name: "t", fps: 60, width: 1920, height: 1080 },
      clipDir: "/y/clips",
    });
    const diff = buildCuesheetDiff(before, after);
    expect(diff.project).toEqual(
      expect.arrayContaining([
        { field: "project.fps", before: 30, after: 60 },
        { field: "clipDir", before: "/x/clips", after: "/y/clips" },
      ]),
    );
    expect(diff.project).toHaveLength(2);
  });

  it("reports bgm added/removed/modified as counts", () => {
    const before = cue({
      bgm: [
        { file: "x.mp3", start: 0, end: 5, volume: 0.5 },
        { file: "y.mp3", start: 5, end: 10, volume: 0.5 },
      ],
    });
    const after = cue({
      bgm: [
        { file: "x.mp3", start: 0, end: 5, volume: 0.8 }, // modified (volume)
        { file: "z.mp3", start: 10, end: 15, volume: 0.5 }, // added; y.mp3 removed
      ],
    });
    const diff = buildCuesheetDiff(before, after);
    expect(diff.bgm).toEqual({ added: 1, removed: 1, modified: 1 });
  });

  it("reports narration field changes when both sides have it enabled", () => {
    const before = cue({ narration: { enabled: true, dir: "/n", volume: 1 } });
    const after = cue({ narration: { enabled: true, dir: "/n", volume: 0.6 } });
    const diff = buildCuesheetDiff(before, after);
    expect(diff.narration).toEqual({
      changed: true,
      fields: [{ field: "volume", before: 1, after: 0.6 }],
    });
  });

  it("reports narration as changed (whole-object) when it's added where there was none", () => {
    const before = cue();
    const after = cue({ narration: { enabled: true, dir: "/n", volume: 1 } });
    const diff = buildCuesheetDiff(before, after);
    expect(diff.narration.changed).toBe(true);
    expect(diff.narration.fields).toEqual([
      { field: "narration", before: null, after: { enabled: true, dir: "/n", volume: 1 } },
    ]);
  });

  it("reports no narration change when neither side has it", () => {
    const diff = buildCuesheetDiff(cue(), cue());
    expect(diff.narration).toEqual({ changed: false, fields: [] });
  });
});
