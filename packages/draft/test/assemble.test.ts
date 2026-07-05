import { describe, expect, it } from "vitest";
import { validateCueSheet } from "@cuesheet/schema";
import { assembleDraft } from "../src/assemble.js";
import type { ClipMoments } from "../src/types.js";

function opts(overrides: Partial<{ clipDir: string; projectName: string }> = {}) {
  return { clipDir: "/src", projectName: "테스트 프로젝트", ...overrides };
}

describe("assembleDraft", () => {
  it("quality 3 미만은 채택하지 않는다", () => {
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

  it("클립 파일명순 -> in 오름차순으로 정렬한다(재배열 금지)", () => {
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

  it("monotonousRange가 30~60초면 배속 커넥터를 삽입하고 출력 길이가 2~5초가 되게 배속을 정한다", () => {
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

  it("60초를 넘는 monotonousRange는 60초로 슬라이스를 잘라 쓰고, 30초 미만은 커넥터로 쓰지 않는다", () => {
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
    expect(seg?.out).toBe(60); // 90초 구간이지만 60초로 슬라이스 제한
  });

  it("배속 커넥터는 에피소드당 8개 상한을 넘지 않는다", () => {
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

  it("검증 실패 케이스: 채택할 세그먼트가 없으면 validateCueSheet가 실패하고 필드경로:이유 형식을 준다", () => {
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

  it("정속 세그먼트는 speed 1, volume 1로 채운다", () => {
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
