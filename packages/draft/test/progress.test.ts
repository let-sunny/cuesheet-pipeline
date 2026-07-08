import { describe, expect, it } from "vitest";
import type { Manifest } from "../src/scan.js";
import {
  buildPairSchedule,
  extractNarrativeEvents,
  progressFileSchema,
  type ProgressJudgment,
} from "../src/progress.js";

function manifest(overrides: Partial<Manifest> = {}): Manifest {
  return { clips: [], evicted: [], ...overrides };
}

describe("buildPairSchedule", () => {
  it("5분(300초) 미만 클립은 제외한다", () => {
    const m = manifest({
      clips: [
        {
          name: "short.mp4",
          durS: 120,
          interval: 5,
          frames: [
            { t: 0, path: "a" },
            { t: 5, path: "b" },
          ],
        },
      ],
    });
    expect(buildPairSchedule(m)).toEqual([]);
  });

  it("5분 이상 클립에서 인접 프레임 쌍(n-1개)을 만든다", () => {
    const m = manifest({
      clips: [
        {
          name: "long.mp4",
          durS: 600,
          interval: 60,
          frames: [
            { t: 0, path: "t0.jpg" },
            { t: 60, path: "t60.jpg" },
            { t: 120, path: "t120.jpg" },
          ],
        },
      ],
    });
    const pairs = buildPairSchedule(m);
    expect(pairs).toEqual([
      { clip: "long.mp4", tA: 0, tB: 60, frameA: "t0.jpg", frameB: "t60.jpg" },
      { clip: "long.mp4", tA: 60, tB: 120, frameA: "t60.jpg", frameB: "t120.jpg" },
    ]);
  });

  it("frames가 시간순이 아니어도 정렬 후 쌍을 만든다", () => {
    const m = manifest({
      clips: [
        {
          name: "unsorted.mp4",
          durS: 600,
          interval: 60,
          frames: [
            { t: 120, path: "t120.jpg" },
            { t: 0, path: "t0.jpg" },
            { t: 60, path: "t60.jpg" },
          ],
        },
      ],
    });
    const pairs = buildPairSchedule(m);
    expect(pairs.map((p) => [p.tA, p.tB])).toEqual([
      [0, 60],
      [60, 120],
    ]);
  });

  it("minDurS를 커스텀하면 그 기준으로 필터링한다", () => {
    const m = manifest({
      clips: [
        {
          name: "mid.mp4",
          durS: 200,
          interval: 15,
          frames: [
            { t: 0, path: "a" },
            { t: 15, path: "b" },
          ],
        },
      ],
    });
    expect(buildPairSchedule(m, 300)).toEqual([]);
    expect(buildPairSchedule(m, 100)).toHaveLength(1);
  });

  it("프레임이 1장 이하인 클립은 쌍이 없다", () => {
    const m = manifest({
      clips: [{ name: "one-frame.mp4", durS: 600, interval: 60, frames: [{ t: 0, path: "a" }] }],
    });
    expect(buildPairSchedule(m)).toEqual([]);
  });
});

describe("extractNarrativeEvents", () => {
  function judgment(overrides: Partial<ProgressJudgment>): ProgressJudgment {
    return {
      clip: "a.mp4",
      tA: 0,
      tB: 60,
      verdict: "same",
      confidence: 5,
      note: "",
      ...overrides,
    };
  }

  it("grew -> shrank(고신뢰) -> grew 순서에서 발견/재개 이벤트를 각각 하나씩 낸다", () => {
    const judgments = [
      judgment({ tA: 0, tB: 60, verdict: "grew", note: "자라는 중" }),
      judgment({ tA: 60, tB: 120, verdict: "shrank", confidence: 4, note: "실수 발견, 풀기 시작" }),
      judgment({ tA: 120, tB: 180, verdict: "shrank", confidence: 4, note: "계속 풀기" }),
      judgment({ tA: 180, tB: 240, verdict: "grew", note: "다시 뜨기 시작" }),
    ];
    const events = extractNarrativeEvents(judgments);
    expect(events).toEqual([
      { clip: "a.mp4", type: "mistake_discovered", atS: 60, note: "실수 발견, 풀기 시작" },
      { clip: "a.mp4", type: "resumed", atS: 180, note: "다시 뜨기 시작" },
    ]);
  });

  it("shrank라도 confidence가 minConfidence 미만이면 발견 이벤트로 치지 않는다", () => {
    const judgments = [
      judgment({ tA: 0, tB: 60, verdict: "grew" }),
      judgment({ tA: 60, tB: 120, verdict: "shrank", confidence: 2, note: "애매함" }),
    ];
    expect(extractNarrativeEvents(judgments)).toEqual([]);
  });

  it("여러 클립은 독립적으로 처리한다", () => {
    const judgments = [
      judgment({ clip: "a.mp4", tA: 0, tB: 60, verdict: "grew" }),
      judgment({ clip: "a.mp4", tA: 60, tB: 120, verdict: "shrank", confidence: 5, note: "a 풀기" }),
      judgment({ clip: "b.mp4", tA: 0, tB: 60, verdict: "grew" }),
      judgment({ clip: "b.mp4", tA: 60, tB: 120, verdict: "same" }),
    ];
    const events = extractNarrativeEvents(judgments);
    expect(events).toEqual([{ clip: "a.mp4", type: "mistake_discovered", atS: 60, note: "a 풀기" }]);
  });

  it("입력 순서가 뒤섞여도 tA 오름차순으로 정렬 후 판단한다", () => {
    const judgments = [
      judgment({ tA: 180, tB: 240, verdict: "grew", note: "재개" }),
      judgment({ tA: 60, tB: 120, verdict: "shrank", confidence: 4, note: "발견" }),
      judgment({ tA: 0, tB: 60, verdict: "grew" }),
      judgment({ tA: 120, tB: 180, verdict: "shrank", confidence: 4 }),
    ];
    const events = extractNarrativeEvents(judgments);
    expect(events).toEqual([
      { clip: "a.mp4", type: "mistake_discovered", atS: 60, note: "발견" },
      { clip: "a.mp4", type: "resumed", atS: 180, note: "재개" },
    ]);
  });

  it("same이 사이에 껴도(grew -> same... -> shrank) 발견 이벤트를 낸다 - 실측 완화 케이스", () => {
    const events = extractNarrativeEvents([
      judgment({ tA: 0, tB: 60, verdict: "grew" }),
      judgment({ tA: 60, tB: 120, verdict: "same" }),
      judgment({ tA: 120, tB: 180, verdict: "same" }),
      judgment({ tA: 180, tB: 240, verdict: "shrank", confidence: 5, note: "풀기" }),
    ]);
    expect(events).toEqual([{ clip: "a.mp4", type: "mistake_discovered", atS: 180, note: "풀기" }]);
  });

  it("shrank -> same... -> grew도 재개 이벤트를 낸다", () => {
    const events = extractNarrativeEvents([
      judgment({ tA: 0, tB: 60, verdict: "shrank", confidence: 5, note: "풀기" }),
      judgment({ tA: 60, tB: 120, verdict: "same" }),
      judgment({ tA: 120, tB: 180, verdict: "grew", note: "재개" }),
    ]);
    expect(events).toEqual([
      { clip: "a.mp4", type: "mistake_discovered", atS: 0, note: "풀기" },
      { clip: "a.mp4", type: "resumed", atS: 120, note: "재개" },
    ]);
  });

  it("선행 grew 없이 첫 유효 판정이 shrank여도 발견 이벤트를 낸다", () => {
    const events = extractNarrativeEvents([
      judgment({ tA: 0, tB: 60, verdict: "same" }),
      judgment({ tA: 60, tB: 120, verdict: "shrank", confidence: 4, note: "풀기" }),
    ]);
    expect(events).toEqual([{ clip: "a.mp4", type: "mistake_discovered", atS: 60, note: "풀기" }]);
  });

  it("계속 같은 상태(same/unclear)만 있으면 이벤트가 없다", () => {
    const judgments = [
      judgment({ tA: 0, tB: 60, verdict: "same" }),
      judgment({ tA: 60, tB: 120, verdict: "unclear" }),
    ];
    expect(extractNarrativeEvents(judgments)).toEqual([]);
  });
});

describe("progressFileSchema", () => {
  it("유효한 판정 배열을 통과시킨다", () => {
    const data = [
      { clip: "a.mp4", tA: 0, tB: 60, verdict: "grew", confidence: 4, note: "손이 편물을 계속 늘림" },
    ];
    expect(progressFileSchema.safeParse(data).success).toBe(true);
  });

  it("잘못된 verdict 값은 거부한다", () => {
    const data = [{ clip: "a.mp4", tA: 0, tB: 60, verdict: "bigger", confidence: 4, note: "" }];
    expect(progressFileSchema.safeParse(data).success).toBe(false);
  });

  it("confidence가 1~5 범위를 벗어나면 거부한다", () => {
    const data = [{ clip: "a.mp4", tA: 0, tB: 60, verdict: "shrank", confidence: 6, note: "" }];
    expect(progressFileSchema.safeParse(data).success).toBe(false);
  });
});
