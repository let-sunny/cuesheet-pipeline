import { describe, expect, it } from "vitest";
import { addBgmTrackToSheet, changeBgmRangeInSheet, removeBgmTrackAt, updateBgmAt } from "../../src/lib/bgmEditing.js";
import { makeCueSheet } from "../helpers/fixtures.js";

function sixSegmentSheet() {
  return makeCueSheet({
    segments: Array.from({ length: 6 }, (_, i) => ({
      clip: "a.mp4",
      in: i * 5,
      out: i * 5 + 5,
      speed: 1,
      volume: 1,
      subtitle: "",
    })),
  });
}

describe("updateBgmAt", () => {
  it("patches only the targeted bgm cue", () => {
    const cue = makeCueSheet({
      bgm: [
        { file: "a.mp3", start: 0, end: 5, volume: 1 },
        { file: "b.mp3", start: 5, end: 10, volume: 1 },
      ],
    });
    const result = updateBgmAt(cue, 1, { volume: 0.5 });
    expect(result.bgm[0]?.volume).toBe(1);
    expect(result.bgm[1]?.volume).toBe(0.5);
  });
});

describe("addBgmTrackToSheet", () => {
  it("anchors the new track at cut 1 through the last cut when there are fewer than 3 cuts", () => {
    const cue = makeCueSheet({
      segments: [
        { clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "" },
        { clip: "a.mp4", in: 5, out: 10, speed: 1, volume: 1, subtitle: "" },
        { clip: "a.mp4", in: 10, out: 15, speed: 1, volume: 1, subtitle: "" },
      ],
    });
    const { cue: result, newIndex } = addBgmTrackToSheet(cue);
    expect(newIndex).toBe(0);
    expect(result.bgm[0]).toMatchObject({ start: 0, end: 15, volume: 1, file: "" });
  });

  it("caps the default span at 3 cuts when there are more than 3", () => {
    const { cue: result } = addBgmTrackToSheet(sixSegmentSheet());
    expect(result.bgm[0]).toMatchObject({ start: 0, end: 15 });
  });

  it("appends after existing tracks, returning the new track's index", () => {
    const cue = makeCueSheet({ bgm: [{ file: "existing.mp3", start: 0, end: 1, volume: 1 }] });
    const { cue: result, newIndex } = addBgmTrackToSheet(cue);
    expect(newIndex).toBe(1);
    expect(result.bgm.length).toBe(2);
  });
});

describe("changeBgmRangeInSheet", () => {
  it("converts a cut-index range back to seconds and updates the targeted cue", () => {
    const cue = makeCueSheet({
      segments: [
        { clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "" },
        { clip: "a.mp4", in: 5, out: 10, speed: 1, volume: 1, subtitle: "" },
        { clip: "a.mp4", in: 10, out: 15, speed: 1, volume: 1, subtitle: "" },
      ],
      bgm: [{ file: "a.mp3", start: 0, end: 5, volume: 1 }],
    });
    const result = changeBgmRangeInSheet(cue, 0, 1, 2);
    expect(result.bgm[0]).toMatchObject({ start: 5, end: 15 });
  });
});

describe("removeBgmTrackAt", () => {
  it("removes the targeted bgm cue", () => {
    const cue = makeCueSheet({
      bgm: [
        { file: "a.mp3", start: 0, end: 5, volume: 1 },
        { file: "b.mp3", start: 5, end: 10, volume: 1 },
      ],
    });
    const result = removeBgmTrackAt(cue, 0);
    expect(result.bgm.length).toBe(1);
    expect(result.bgm[0]?.file).toBe("b.mp3");
  });
});
