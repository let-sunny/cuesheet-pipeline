import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateCueSheet } from "../src/index.js";

const sample = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../examples/sample.cuesheet.json", import.meta.url)),
    "utf-8",
  ),
) as unknown;

describe("validateCueSheet - 통과 케이스", () => {
  it("예제 큐시트는 검증을 통과한다", () => {
    const result = validateCueSheet(sample);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.segments).toHaveLength(3);
      expect(result.data.project.fps).toBe(30);
    }
  });

  it("speed 미지정 시 기본값 1.0이 적용된다", () => {
    const input = {
      ...(sample as Record<string, unknown>),
      segments: [{ clip: "a.mp4", in: 0, out: 1, subtitle: "" }],
    };
    const result = validateCueSheet(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.segments[0]?.speed).toBe(1.0);
    }
  });
});

describe("validateCueSheet - 실패 케이스", () => {
  it("in >= out이면 명확한 에러를 낸다", () => {
    const bad = {
      ...(sample as Record<string, unknown>),
      segments: [{ clip: "a.mp4", in: 5, out: 3, speed: 1, subtitle: "" }],
    };
    const result = validateCueSheet(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("segments[0].in"))).toBe(true);
      expect(result.errors.some((e) => e.includes("in < out"))).toBe(true);
    }
  });

  it("segments가 비어 있으면 실패한다", () => {
    const bad = { ...(sample as Record<string, unknown>), segments: [] };
    const result = validateCueSheet(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("최소 1개"))).toBe(true);
    }
  });

  it("volume이 범위를 벗어나면 실패한다", () => {
    const bad = {
      ...(sample as Record<string, unknown>),
      bgm: [{ file: "b.mp3", start: 0, end: 10, volume: 1.5 }],
    };
    const result = validateCueSheet(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("bgm[0].volume"))).toBe(true);
    }
  });

  it("fps가 음수면 실패한다", () => {
    const bad = {
      ...(sample as Record<string, unknown>),
      project: { name: "x", fps: -30, width: 1920, height: 1080 },
    };
    const result = validateCueSheet(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("project.fps"))).toBe(true);
    }
  });

  it("여러 필드가 동시에 틀리면 에러도 여러 개 나온다", () => {
    const bad = {
      project: { name: "", fps: 0, width: -1, height: 0 },
      clipDir: "",
      intro: null,
      outro: null,
      segments: [],
      bgm: [],
      subtitleStyle: {
        font: "",
        size: 0,
        color: "not-a-hex",
        outlineColor: "#000",
        outlineWidth: -1,
        position: "middle",
      },
    };
    const result = validateCueSheet(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(3);
    }
  });
});
