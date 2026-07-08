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
  it("excludes clips under 5 minutes (300s)", () => {
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

  it("builds adjacent frame pairs (n-1) for a clip of 5 minutes or more", () => {
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

  it("sorts frames before pairing even if they are not in time order", () => {
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

  it("filters by a custom minDurS when given", () => {
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

  it("has no pairs for a clip with one frame or fewer", () => {
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

  it("emits one discovery event and one resume event for a grew -> shrank(high confidence) -> grew sequence", () => {
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

  it("does not count a shrank as a discovery event if confidence is below minConfidence", () => {
    const judgments = [
      judgment({ tA: 0, tB: 60, verdict: "grew" }),
      judgment({ tA: 60, tB: 120, verdict: "shrank", confidence: 2, note: "애매함" }),
    ];
    expect(extractNarrativeEvents(judgments)).toEqual([]);
  });

  it("processes multiple clips independently", () => {
    const judgments = [
      judgment({ clip: "a.mp4", tA: 0, tB: 60, verdict: "grew" }),
      judgment({ clip: "a.mp4", tA: 60, tB: 120, verdict: "shrank", confidence: 5, note: "a 풀기" }),
      judgment({ clip: "b.mp4", tA: 0, tB: 60, verdict: "grew" }),
      judgment({ clip: "b.mp4", tA: 60, tB: 120, verdict: "same" }),
    ];
    const events = extractNarrativeEvents(judgments);
    expect(events).toEqual([{ clip: "a.mp4", type: "mistake_discovered", atS: 60, note: "a 풀기" }]);
  });

  it("sorts by ascending tA before judging even if the input order is shuffled", () => {
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

  it("emits a discovery event even with same in between (grew -> same... -> shrank) - relaxed case from real measurements", () => {
    const events = extractNarrativeEvents([
      judgment({ tA: 0, tB: 60, verdict: "grew" }),
      judgment({ tA: 60, tB: 120, verdict: "same" }),
      judgment({ tA: 120, tB: 180, verdict: "same" }),
      judgment({ tA: 180, tB: 240, verdict: "shrank", confidence: 5, note: "풀기" }),
    ]);
    expect(events).toEqual([{ clip: "a.mp4", type: "mistake_discovered", atS: 180, note: "풀기" }]);
  });

  it("shrank -> same... -> grew also emits a resume event", () => {
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

  it("emits a discovery event even when the first valid verdict is shrank with no preceding grew", () => {
    const events = extractNarrativeEvents([
      judgment({ tA: 0, tB: 60, verdict: "same" }),
      judgment({ tA: 60, tB: 120, verdict: "shrank", confidence: 4, note: "풀기" }),
    ]);
    expect(events).toEqual([{ clip: "a.mp4", type: "mistake_discovered", atS: 60, note: "풀기" }]);
  });

  it("has no events when every verdict stays the same state (same/unclear)", () => {
    const judgments = [
      judgment({ tA: 0, tB: 60, verdict: "same" }),
      judgment({ tA: 60, tB: 120, verdict: "unclear" }),
    ];
    expect(extractNarrativeEvents(judgments)).toEqual([]);
  });
});

describe("progressFileSchema", () => {
  it("passes a valid array of judgments", () => {
    const data = [
      { clip: "a.mp4", tA: 0, tB: 60, verdict: "grew", confidence: 4, note: "손이 편물을 계속 늘림" },
    ];
    expect(progressFileSchema.safeParse(data).success).toBe(true);
  });

  it("rejects an invalid verdict value", () => {
    const data = [{ clip: "a.mp4", tA: 0, tB: 60, verdict: "bigger", confidence: 4, note: "" }];
    expect(progressFileSchema.safeParse(data).success).toBe(false);
  });

  it("rejects confidence outside the 1-5 range", () => {
    const data = [{ clip: "a.mp4", tA: 0, tB: 60, verdict: "shrank", confidence: 6, note: "" }];
    expect(progressFileSchema.safeParse(data).success).toBe(false);
  });
});
