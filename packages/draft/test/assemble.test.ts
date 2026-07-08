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
    expect(seg?.out).toBe(60); // 90s range, but the slice is capped at 60s
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

  it("패딩 포함 길이가 3.5초를 넘으면 양끝을 대칭으로 줄여 3.5초로 클램프한다", () => {
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

  it("긴 moments 입력 -> 정속 컷 전체 평균 길이가 2.8~3.0초로 수렴한다", () => {
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

  it("faceExposed: true인 monotonousRange는 배속 커넥터로 뽑지 않는다", () => {
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

  it("faceExposed가 false면 desc에 위험 단어가 있어도 안전으로 간주해 커넥터를 뽑는다", () => {
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

  it("faceExposed 생략 + desc에 '얼굴'과 '노출' 동시 포함 -> 휴리스틱으로 위험 판정해 건너뛴다", () => {
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

  it("faceExposed 생략 + desc에 위험 키워드가 없으면 기존대로 커넥터를 뽑는다(회귀)", () => {
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

  it("같은 클립에 안전한 단조구간이 없으면 그 클립엔 커넥터를 넣지 않고, 다른 클립의 안전 구간은 정상 채택한다", () => {
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

  it("기본 패딩(0.4초)이 정속 하이라이트 양끝에 적용된다", () => {
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

  it("boundaryPadS: 0이면 패딩 없이 기존 동작대로 moment 원본 경계를 그대로 쓴다", () => {
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

  it("클립 경계(clipDurations)를 넘는 패딩은 클립 길이에서 클램프한다", () => {
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

  it("같은 클립 내 인접 컷의 패딩이 겹치면 겹치지 않는 만큼만 남기고 되돌린다", () => {
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

  it("config.qualityThreshold를 5로 올리면 quality 3~4는 채택하지 않는다", () => {
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

  it("config.timelapseConnector.capPerEpisode를 낮추면 그 상한까지만 배속 커넥터를 뽑는다", () => {
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
