import { describe, expect, it } from "vitest";
import { validateCueSheet } from "@cuesheet/schema";
import type { CueSheet } from "@cuesheet/schema";
import { buildSrt, secondsToSrtTimestamp } from "../src/srt.js";

function make(overrides: Record<string, unknown> = {}): CueSheet {
  const base = {
    project: { name: "t", fps: 30, width: 1920, height: 1080 },
    clipDir: "/clips",
    intro: null,
    outro: null,
    segments: [
      { clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "안녕하세요" },
      { clip: "b.mp4", in: 2, out: 6, speed: 1.5, volume: 0.3, subtitle: "" },
      { clip: "c.mp4", in: 0, out: 4, speed: 2, volume: 1, subtitle: "빠른 컷: 100%" },
    ],
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

describe("secondsToSrtTimestamp", () => {
  it("HH:MM:SS,mmm 포맷으로 변환한다", () => {
    expect(secondsToSrtTimestamp(0)).toBe("00:00:00,000");
    expect(secondsToSrtTimestamp(1.5)).toBe("00:00:01,500");
    expect(secondsToSrtTimestamp(3661.234)).toBe("01:01:01,234");
  });

  it("음수는 0으로 클램프한다", () => {
    expect(secondsToSrtTimestamp(-1)).toBe("00:00:00,000");
  });
});

describe("buildSrt", () => {
  it("자막이 빈 세그먼트는 스킵하고 남은 큐만으로 인덱스를 연속 재부여한다", () => {
    const srt = buildSrt(make());
    const blocks = srt.split("\n\n");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toContain("1\n");
    expect(blocks[1]).toContain("2\n");
    expect(srt).not.toContain("b.mp4");
  });

  it("speed를 반영해 출력 타임라인을 누적한다((out-in)/speed)", () => {
    const srt = buildSrt(make());
    // Segment 1: 0-5s (subtitle), segment 2: 5-7.667s (no subtitle, speed 1.5 -> 4/1.5=2.667s),
    // segment 3: 7.667-9.667s (subtitle, speed 2 -> 4/2=2s)
    expect(srt).toContain("00:00:00,000 --> 00:00:05,000");
    expect(srt).toContain("00:00:07,667 --> 00:00:09,667");
  });

  it("특수문자(콜론 등)를 그대로 보존한다(SRT 자막 텍스트는 이스케이프 불필요)", () => {
    const srt = buildSrt(make());
    expect(srt).toContain("빠른 컷: 100%");
  });

  it("세그먼트가 모두 빈 자막이면 빈 문자열을 반환한다", () => {
    const cue = make({
      segments: [{ clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "" }],
    });
    expect(buildSrt(cue)).toBe("");
  });
});
