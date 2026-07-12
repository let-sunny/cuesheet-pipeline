import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateCueSheet } from "@cuesheet/schema";
import { assembleDraft } from "../src/assemble.js";
import { loadDomainBundle, resolveDomainAssembleConfig } from "../src/domain.js";
import type { ClipMoments } from "../src/types.js";

const KNITTING = fileURLToPath(new URL("../../../domains/knitting", import.meta.url));

function opts(overrides: Partial<{ clipDir: string; projectName: string }> = {}) {
  return { clipDir: "/src", projectName: "테스트 프로젝트", ...overrides };
}

describe("assembleDraft", () => {
  it("does not adopt quality below 3", () => {
    const moments: ClipMoments[] = [
      {
        clip: "a.mp4",
        clipSummary: "요약",
        moments: [
          { inS: 0, outS: 3, shotType: "object", memo: "낮음1", quality: 1 },
          { inS: 5, outS: 8, shotType: "object", memo: "낮음2", quality: 2 },
          { inS: 10, outS: 13, shotType: "object", memo: "채택", quality: 3 },
        ],
        monotonousRanges: [],
      },
    ];
    const cue = assembleDraft(moments, opts());
    expect(cue.segments).toHaveLength(1);
    expect(cue.segments?.[0]?.subtitle).toBe("채택");
  });

  it("sorts by clip filename then ascending in (no reordering)", () => {
    const moments: ClipMoments[] = [
      {
        clip: "b.mp4",
        clipSummary: "",
        moments: [{ inS: 5, outS: 8, shotType: "object", memo: "b-late", quality: 5 }],
        monotonousRanges: [],
      },
      {
        clip: "a.mp4",
        clipSummary: "",
        moments: [
          { inS: 10, outS: 13, shotType: "object", memo: "a-late", quality: 5 },
          { inS: 1, outS: 4, shotType: "object", memo: "a-early", quality: 5 },
        ],
        monotonousRanges: [],
      },
    ];
    const cue = assembleDraft(moments, opts());
    expect(cue.segments?.map((s) => s.subtitle)).toEqual(["a-early", "a-late", "b-late"]);
  });

  it("inserts a timelapse connector for a 30-60s monotonousRange and picks a speed that yields a 2-5s output length", () => {
    const moments: ClipMoments[] = [
      {
        clip: "a.mp4",
        clipSummary: "",
        moments: [],
        monotonousRanges: [{ startS: 0, endS: 42, desc: "단조 구간" }],
      },
    ];
    const cue = assembleDraft(moments, opts());
    expect(cue.segments).toHaveLength(1);
    const seg = cue.segments?.[0];
    expect(seg?.subtitle).toBe("(빨리감기) 단조 구간");
    expect(seg?.speed).toBeGreaterThanOrEqual(12);
    expect(seg?.speed).toBeLessThanOrEqual(16);
    const outputLen = ((seg?.out ?? 0) - (seg?.in ?? 0)) / (seg?.speed ?? 1);
    expect(outputLen).toBeGreaterThanOrEqual(2);
    expect(outputLen).toBeLessThanOrEqual(5);
  });

  it("slices a monotonousRange over 60s down to 60s, and does not use one under 30s as a connector", () => {
    const moments: ClipMoments[] = [
      {
        clip: "a.mp4",
        clipSummary: "",
        moments: [],
        monotonousRanges: [
          { startS: 0, endS: 90, desc: "긴 단조 구간" },
          { startS: 100, endS: 120, desc: "짧은 단조 구간" },
        ],
      },
    ];
    const cue = assembleDraft(moments, opts());
    expect(cue.segments).toHaveLength(1);
    const seg = cue.segments?.[0];
    expect(seg?.in).toBe(0);
    expect(seg?.out).toBe(60); // 90s range, but the slice is capped at 60s
  });

  it("timelapse connectors do not exceed the 8-per-episode cap", () => {
    const monotonousRanges = Array.from({ length: 12 }, (_, i) => ({
      startS: i * 100,
      endS: i * 100 + 40,
      desc: `구간${i}`,
    }));
    const moments: ClipMoments[] = [
      { clip: "a.mp4", clipSummary: "", moments: [], monotonousRanges },
    ];
    const cue = assembleDraft(moments, opts());
    expect(cue.segments).toHaveLength(8);
  });

  it("failure case: validateCueSheet fails with a field-path:reason format when no segments are adopted", () => {
    const moments: ClipMoments[] = [
      {
        clip: "a.mp4",
        clipSummary: "",
        moments: [{ inS: 0, outS: 3, shotType: "object", memo: "너무 낮음", quality: 1 }],
        monotonousRanges: [],
      },
    ];
    const cue = assembleDraft(moments, opts());
    const result = validateCueSheet(cue);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.startsWith("segments:"))).toBe(true);
    }
  });

  it("clamps to 3.5s by trimming both ends symmetrically when the padded length exceeds 3.5s", () => {
    // Add a second (short) cut too, to keep the overall average under 3.1s — this prevents
    // the average-convergence pass from kicking in and further trimming this case's clamp
    // value (verified separately in another test).
    const moments: ClipMoments[] = [
      {
        clip: "a.mp4",
        clipSummary: "",
        moments: [
          { inS: 0, outS: 6, shotType: "object", memo: "긴 컷", quality: 5 },
          { inS: 50, outS: 50.6, shotType: "object", memo: "짧은 컷", quality: 5 },
        ],
        monotonousRanges: [],
      },
    ];
    // Default padding 0.4s: padded length 6.8 -> excess 3.3 trimmed 1.65 from each end to reach 3.5s.
    const cue = assembleDraft(moments, opts());
    const seg = cue.segments?.find((s) => s.subtitle === "긴 컷");
    expect((seg?.out ?? 0) - (seg?.in ?? 0)).toBeCloseTo(3.5, 10);
    expect(seg?.in).toBeCloseTo(1.45, 10);
    expect(seg?.out).toBeCloseTo(4.95, 10);
  });

  it("with a long moments input, the overall average length of normal-speed cuts converges to 2.8-3.0s", () => {
    const moments: ClipMoments[] = [
      {
        clip: "a.mp4",
        clipSummary: "",
        moments: [
          { inS: 0, outS: 6, shotType: "object", memo: "컷1", quality: 5 },
          { inS: 10, outS: 16, shotType: "object", memo: "컷2", quality: 5 },
          { inS: 20, outS: 26, shotType: "object", memo: "컷3", quality: 5 },
          { inS: 30, outS: 36, shotType: "object", memo: "컷4", quality: 5 },
        ],
        monotonousRanges: [],
      },
    ];
    const cue = assembleDraft(moments, opts());
    expect(cue.segments).toHaveLength(4);
    const durations = (cue.segments ?? []).map((s) => s.out - s.in);
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    expect(avg).toBeGreaterThanOrEqual(2.8);
    expect(avg).toBeLessThanOrEqual(3.0);
    for (const d of durations) {
      expect(d).toBeGreaterThanOrEqual(2);
      expect(d).toBeLessThanOrEqual(3.5);
    }
  });

  it("does not pick a monotonousRange with faceExposed: true as a timelapse connector", () => {
    const moments: ClipMoments[] = [
      {
        clip: "a.mp4",
        clipSummary: "",
        moments: [],
        monotonousRanges: [
          { startS: 0, endS: 42, desc: "얼굴은 안 보임", faceExposed: true },
        ],
      },
    ];
    const cue = assembleDraft(moments, opts());
    expect(cue.segments).toHaveLength(0);
  });

  it("when faceExposed is false, treats it as safe and picks a connector even if desc has a risk word", () => {
    const moments: ClipMoments[] = [
      {
        clip: "a.mp4",
        clipSummary: "",
        moments: [],
        monotonousRanges: [
          { startS: 0, endS: 42, desc: "얼굴이 노출되어 있음", faceExposed: false },
        ],
      },
    ];
    const cue = assembleDraft(moments, opts());
    expect(cue.segments).toHaveLength(1);
  });

  it("facePolicyEnabled:false lets a face-exposure-risk range become a timelapse connector", () => {
    const moments: ClipMoments[] = [
      {
        clip: "a.mp4",
        clipSummary: "",
        moments: [],
        monotonousRanges: [{ startS: 0, endS: 42, desc: "x", faceExposed: true }],
      },
    ];
    expect(assembleDraft(moments, opts()).segments).toHaveLength(0); // default: face policy on -> excluded
    expect(assembleDraft(moments, { ...opts(), facePolicyEnabled: false }).segments).toHaveLength(1);
  });

  it("the knitting domain grammar produces byte-identical output to bare assemble", () => {
    const moments: ClipMoments[] = [
      {
        clip: "a.mp4",
        clipSummary: "",
        moments: [
          { inS: 10, outS: 13, shotType: "hand-closeup", memo: "뜨는 중", quality: 4 },
          { inS: 20, outS: 23, shotType: "cat", memo: "고앵이", quality: 5 },
        ],
        monotonousRanges: [{ startS: 100, endS: 140, desc: "단조", faceExposed: false }],
      },
    ];
    const bare = assembleDraft(moments, opts());
    const bundle = loadDomainBundle(KNITTING);
    const domained = assembleDraft(moments, {
      ...opts(),
      configBase: resolveDomainAssembleConfig(bundle),
      facePolicyEnabled: bundle.facePolicy.enabled,
    });
    expect(domained).toEqual(bare);
  });

  it("when faceExposed is omitted and desc contains both '얼굴'(face) and '노출'(exposure), the heuristic judges it risky and skips it", () => {
    const moments: ClipMoments[] = [
      {
        clip: "a.mp4",
        clipSummary: "",
        moments: [],
        monotonousRanges: [
          { startS: 0, endS: 42, desc: "얼굴(눈~입)이 계속 노출되어 있어 세로 크롭 없이는 사용 불가" },
        ],
      },
    ];
    const cue = assembleDraft(moments, opts());
    expect(cue.segments).toHaveLength(0);
  });

  it("when faceExposed is omitted and desc has no risk keyword, picks a connector as before (regression)", () => {
    const moments: ClipMoments[] = [
      {
        clip: "a.mp4",
        clipSummary: "",
        moments: [],
        monotonousRanges: [{ startS: 0, endS: 42, desc: "손으로 계속 뜨는 중" }],
      },
    ];
    const cue = assembleDraft(moments, opts());
    expect(cue.segments).toHaveLength(1);
    expect(cue.segments?.[0]?.subtitle).toBe("(빨리감기) 손으로 계속 뜨는 중");
  });

  it("skips the connector for a clip with no safe monotonous range, while still adopting another clip's safe range", () => {
    const moments: ClipMoments[] = [
      {
        clip: "a.mp4",
        clipSummary: "",
        moments: [],
        monotonousRanges: [{ startS: 0, endS: 42, desc: "얼굴 계속 노출" }],
      },
      {
        clip: "b.mp4",
        clipSummary: "",
        moments: [],
        monotonousRanges: [{ startS: 0, endS: 42, desc: "안전 구간", faceExposed: false }],
      },
    ];
    const cue = assembleDraft(moments, opts());
    expect(cue.segments).toHaveLength(1);
    expect(cue.segments?.[0]?.clip).toBe("b.mp4");
  });

  it("applies the default padding (0.4s) to both ends of a normal-speed highlight", () => {
    const moments: ClipMoments[] = [
      {
        clip: "a.mp4",
        clipSummary: "",
        moments: [{ inS: 5, outS: 7, shotType: "object", memo: "컷", quality: 5 }],
        monotonousRanges: [],
      },
    ];
    const cue = assembleDraft(moments, opts());
    const seg = cue.segments?.[0];
    expect(seg?.in).toBeCloseTo(4.6, 10);
    expect(seg?.out).toBeCloseTo(7.4, 10);
  });

  it("boundaryPadS: 0 uses the moment's original boundaries as-is, with no padding (previous behavior)", () => {
    const moments: ClipMoments[] = [
      {
        clip: "a.mp4",
        clipSummary: "",
        moments: [{ inS: 5, outS: 7, shotType: "object", memo: "컷", quality: 5 }],
        monotonousRanges: [],
      },
    ];
    const cue = assembleDraft(moments, { ...opts(), boundaryPadS: 0 });
    const seg = cue.segments?.[0];
    expect(seg?.in).toBe(5);
    expect(seg?.out).toBe(7);
  });

  it("clamps padding that exceeds the clip boundary (clipDurations) to the clip length", () => {
    // Compose a short moment so the padded length doesn't exceed MAX_CUT_S (3.5s), keeping
    // the clamp/average-convergence passes from mixing in — so only the boundary
    // (clipDurations) clamp is observed in isolation.
    const moments: ClipMoments[] = [
      {
        clip: "a.mp4",
        clipSummary: "",
        moments: [{ inS: 0.2, outS: 1.7, shotType: "object", memo: "컷", quality: 5 }],
        monotonousRanges: [],
      },
    ];
    const cue = assembleDraft(moments, { ...opts(), clipDurations: { "a.mp4": 2 } });
    const seg = cue.segments?.[0];
    // Front: 0.2 - 0.4 = -0.2 -> clamped to 0. Back: 1.7 + 0.4 = 2.1 -> clamped to clip length 2.
    expect(seg?.in).toBe(0);
    expect(seg?.out).toBe(2);
  });

  it("when padding of adjacent cuts in the same clip overlaps, rolls back to leave only the non-overlapping amount", () => {
    const moments: ClipMoments[] = [
      {
        clip: "a.mp4",
        clipSummary: "",
        moments: [
          { inS: 0, outS: 2, shotType: "object", memo: "앞컷", quality: 5 },
          { inS: 2.5, outS: 4.5, shotType: "object", memo: "뒤컷", quality: 5 },
        ],
        monotonousRanges: [],
      },
    ];
    // With padding alone, front cut out=2.4 and back cut in=2.1 would overlap by 0.3s ->
    // rolled back by half (0.15) each, meeting at 2.25.
    const cue = assembleDraft(moments, opts());
    const front = cue.segments?.[0];
    const back = cue.segments?.[1];
    expect(front?.out).toBeCloseTo(2.25, 10);
    expect(back?.in).toBeCloseTo(2.25, 10);
    expect(front?.out ?? 0).toBeLessThanOrEqual(back?.in ?? 0);
  });

  it("raising config.qualityThreshold to 5 excludes quality 3-4", () => {
    const moments: ClipMoments[] = [
      {
        clip: "a.mp4",
        clipSummary: "요약",
        moments: [
          { inS: 0, outS: 3, shotType: "object", memo: "quality3", quality: 3 },
          { inS: 5, outS: 8, shotType: "object", memo: "quality4", quality: 4 },
          { inS: 10, outS: 13, shotType: "object", memo: "quality5", quality: 5 },
        ],
        monotonousRanges: [],
      },
    ];
    const cue = assembleDraft(moments, { ...opts(), config: { qualityThreshold: 5 } });
    expect(cue.segments).toHaveLength(1);
    expect(cue.segments?.[0]?.subtitle).toBe("quality5");
  });

  it("lowering config.timelapseConnector.capPerEpisode picks timelapse connectors only up to that cap", () => {
    const monotonousRanges = Array.from({ length: 5 }, (_, i) => ({
      startS: i * 100,
      endS: i * 100 + 40,
      desc: `구간${i}`,
    }));
    const moments: ClipMoments[] = [
      { clip: "a.mp4", clipSummary: "", moments: [], monotonousRanges },
    ];
    const cue = assembleDraft(moments, {
      ...opts(),
      config: { timelapseConnector: { capPerEpisode: 2 } },
    });
    expect(cue.segments).toHaveLength(2);
  });

  it("fills normal-speed segments with speed 1, volume 1", () => {
    const moments: ClipMoments[] = [
      {
        clip: "a.mp4",
        clipSummary: "",
        moments: [{ inS: 0, outS: 3, shotType: "hand-closeup", memo: "손", quality: 4 }],
        monotonousRanges: [],
      },
    ];
    const cue = assembleDraft(moments, opts());
    expect(cue.segments?.[0]).toMatchObject({ speed: 1, volume: 1 });
  });
});
