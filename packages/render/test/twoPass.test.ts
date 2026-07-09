import { describe, expect, it } from "vitest";
import { validateCueSheet } from "@cuesheet/schema";
import type { CueSheet } from "@cuesheet/schema";
import type { TitleAsset } from "../src/title.js";
import {
  buildTitleOverlayPass,
  deriveIntermediatePath,
  frameTitleSegmentIndices,
  needsTwoPassRender,
  totalConcatInputCount,
  TWO_PASS_INPUT_THRESHOLD,
} from "../src/twoPass.js";

function makeSegment(overrides: Record<string, unknown> = {}) {
  return { clip: "a.mp4", in: 0, out: 3, speed: 1, volume: 1, subtitle: "", ...overrides };
}

function make(segmentCount: number, overrides: Record<string, unknown> = {}): CueSheet {
  const base = {
    project: { name: "t", fps: 30, width: 1920, height: 1080 },
    clipDir: "/clips",
    intro: null,
    outro: null,
    segments: Array.from({ length: segmentCount }, () => makeSegment()),
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

const framesAsset: TitleAsset = { kind: "frames", dir: "/cache/abc", frameCount: 60, fps: 30 };
const assAsset: TitleAsset = { kind: "ass", path: "/cache/abc.ass" };

describe("totalConcatInputCount", () => {
  it("counts segments plus intro/outro", () => {
    expect(totalConcatInputCount(make(5))).toBe(5);
    expect(totalConcatInputCount(make(5, { intro: "/i.mp4", outro: "/o.mp4" }))).toBe(7);
  });
});

describe("frameTitleSegmentIndices", () => {
  it("only picks segments whose resolved title asset is a captured-frames sequence", () => {
    const cue = make(3, {
      segments: [
        makeSegment({ title: { text: "A", preset: "gooey", durationS: 2 } }),
        makeSegment({ title: { text: "B", preset: "typing", durationS: 2 } }),
        makeSegment(),
      ],
    });
    const indices = frameTitleSegmentIndices(cue, { 0: framesAsset, 1: assAsset });
    expect(indices).toEqual([0]);
  });

  it("returns an empty array when there are no titles at all", () => {
    expect(frameTitleSegmentIndices(make(3), undefined)).toEqual([]);
  });
});

describe("needsTwoPassRender", () => {
  it("is false when there are no captured-frames titles, regardless of input count", () => {
    expect(needsTwoPassRender(make(50), [])).toBe(false);
  });

  it("is false below TWO_PASS_INPUT_THRESHOLD even with a captured-frames title", () => {
    const cue = make(TWO_PASS_INPUT_THRESHOLD - 1);
    expect(needsTwoPassRender(cue, [0])).toBe(false);
  });

  it("is true at/above TWO_PASS_INPUT_THRESHOLD with a captured-frames title present", () => {
    expect(needsTwoPassRender(make(TWO_PASS_INPUT_THRESHOLD), [0])).toBe(true);
    expect(needsTwoPassRender(make(TWO_PASS_INPUT_THRESHOLD + 5), [0])).toBe(true);
  });
});

describe("deriveIntermediatePath", () => {
  it("inserts the suffix before the extension", () => {
    expect(deriveIntermediatePath("out.mp4")).toBe("out.pass1-intermediate.mp4");
    expect(deriveIntermediatePath("/a/b/out.mp4")).toBe("/a/b/out.pass1-intermediate.mp4");
  });

  it("appends a default extension when the output path has none", () => {
    expect(deriveIntermediatePath("/a/b/out")).toBe("/a/b/out.pass1-intermediate.mp4");
  });

  it("does not mistake a dotted directory name for an extension", () => {
    expect(deriveIntermediatePath("/a.b/out")).toBe("/a.b/out.pass1-intermediate.mp4");
  });
});

describe("buildTitleOverlayPass", () => {
  it("places a single title's overlay window at its segment's output-timeline offset", () => {
    const cue = make(3, {
      segments: [
        makeSegment({ out: 5 }),
        makeSegment({ out: 4, title: { text: "Hi", preset: "gooey", durationS: 2 } }),
        makeSegment({ out: 3 }),
      ],
    });
    const cmd = buildTitleOverlayPass(cue, "/tmp/intermediate.mp4", "out.mp4", [1], { 1: framesAsset });

    // Segment 1 starts at output time 5 (segment 0's duration) - overlay window [5, 7).
    expect(cmd.filterComplex).toContain("setpts=PTS+5/TB");
    expect(cmd.filterComplex).toContain("enable='between(t,5,7)'");
    expect(cmd.args).toContain("-framerate");
    expect(cmd.args.join(" ")).toContain("frame_%04d.png");
    expect(cmd.args).toEqual(expect.arrayContaining(["-i", "/tmp/intermediate.mp4"]));
    expect(cmd.args).toEqual(expect.arrayContaining(["-c:a", "copy"]));
    expect(cmd.outputPath).toBe("out.mp4");
  });

  it("chains multiple titles sequentially, each at its own offset", () => {
    const cue = make(2, {
      segments: [
        makeSegment({ out: 5, title: { text: "One", preset: "gooey", durationS: 1 } }),
        makeSegment({ out: 4, title: { text: "Two", preset: "melt", durationS: 1 } }),
      ],
    });
    const cmd = buildTitleOverlayPass(cue, "/tmp/i.mp4", "out.mp4", [0, 1], {
      0: framesAsset,
      1: framesAsset,
    });
    expect(cmd.filterComplex).toContain("enable='between(t,0,1)'");
    expect(cmd.filterComplex).toContain("enable='between(t,5,6)'");
    // Second overlay's main input is the first overlay's output label, not the raw intermediate.
    expect(cmd.filterComplex).toMatch(/\[vtitle0\]\[vtitleshift1\]overlay/);
    expect(cmd.args.filter((a) => a === "-i").length).toBe(3); // intermediate + 2 title PNG sequences
  });

  it("applies a shifted backdrop dim overlay before the title overlay when title.backdrop is set", () => {
    const cue = make(1, {
      segments: [
        makeSegment({ out: 4, title: { text: "Hi", preset: "particle", durationS: 2, backdrop: { dim: 0.6 } } }),
      ],
    });
    const cmd = buildTitleOverlayPass(cue, "/tmp/i.mp4", "out.mp4", [0], { 0: framesAsset });
    expect(cmd.filterComplex).toContain("colorchannelmixer=aa=0.6");
    expect(cmd.filterComplex).toContain("[dim0]");
    expect(cmd.filterComplex).toMatch(/\[0:v\]\[dim0\]overlay/);
  });

  it("skips an index whose title asset is not a captured-frames kind (defensive; frameTitleSegmentIndices normally filters this out already)", () => {
    const cue = make(1, {
      segments: [makeSegment({ out: 4, title: { text: "Hi", preset: "typing", durationS: 2 } })],
    });
    const cmd = buildTitleOverlayPass(cue, "/tmp/i.mp4", "out.mp4", [0], { 0: assAsset });
    expect(cmd.filterComplex).toBe("");
    expect(cmd.args.filter((a) => a === "-i").length).toBe(1);
  });
});
