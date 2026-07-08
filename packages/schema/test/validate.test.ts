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

  it("narration 필드가 없는 기존 큐시트도 그대로 유효하다", () => {
    const result = validateCueSheet(sample);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.narration).toBeUndefined();
      expect(result.data.segments[0]?.narration).toBeUndefined();
    }
  });

  it("narration enabled+파일명이 있으면 유효하다", () => {
    const input = {
      ...(sample as Record<string, unknown>),
      narration: { enabled: true, dir: "/narration", volume: 0.8 },
      segments: [
        { clip: "a.mp4", in: 0, out: 1, subtitle: "", narration: "line01.mp3" },
      ],
    };
    const result = validateCueSheet(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.narration).toEqual({ enabled: true, dir: "/narration", volume: 0.8 });
      expect(result.data.segments[0]?.narration).toBe("line01.mp3");
    }
  });

  it("crop이 유효하면 통과하고 그대로 반영된다", () => {
    const input = {
      ...(sample as Record<string, unknown>),
      segments: [
        { clip: "a.mp4", in: 0, out: 1, subtitle: "", crop: { x: 0, y: 0.25, w: 1, h: 0.75 } },
      ],
    };
    const result = validateCueSheet(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.segments[0]?.crop).toEqual({ x: 0, y: 0.25, w: 1, h: 0.75 });
    }
  });

  it("crop이 없으면(생략) 기존 큐시트도 그대로 유효하다", () => {
    const result = validateCueSheet(sample);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.segments[0]?.crop).toBeUndefined();
    }
  });

  it("segment.styleOverride가 없으면(생략) 기존 큐시트도 그대로 유효하다", () => {
    const result = validateCueSheet(sample);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.segments[0]?.styleOverride).toBeUndefined();
    }
  });

  it("segment.styleOverride가 전체 필드를 채우면 유효하다", () => {
    const input = {
      ...(sample as Record<string, unknown>),
      segments: [
        {
          clip: "a.mp4",
          in: 0,
          out: 1,
          subtitle: "",
          styleOverride: {
            font: "Pretendard",
            size: 60,
            color: "#ffff00",
            outlineColor: "#000000",
            outlineWidth: 4,
            position: "top",
            background: { color: "#000000", opacity: 0.5, padding: 10 },
            margin: 20,
          },
        },
      ],
    };
    const result = validateCueSheet(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.segments[0]?.styleOverride?.size).toBe(60);
      expect(result.data.segments[0]?.styleOverride?.position).toBe("top");
    }
  });

  it("segment.styleOverride가 부분(size만)이면 그 필드만 담긴다", () => {
    const input = {
      ...(sample as Record<string, unknown>),
      segments: [
        { clip: "a.mp4", in: 0, out: 1, subtitle: "", styleOverride: { size: 72 } },
      ],
    };
    const result = validateCueSheet(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.segments[0]?.styleOverride).toEqual({ size: 72 });
    }
  });

  it("segment.styleOverride가 null이면 유효하다(오버라이드 없음과 동일 취급)", () => {
    const input = {
      ...(sample as Record<string, unknown>),
      segments: [{ clip: "a.mp4", in: 0, out: 1, subtitle: "", styleOverride: null }],
    };
    const result = validateCueSheet(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.segments[0]?.styleOverride).toBeNull();
    }
  });

  it("4K 프리셋 스케일 크기의 margin/background.padding도 유효하다(상한 완화: margin<=600, padding<=120)", () => {
    const input = {
      ...(sample as Record<string, unknown>),
      subtitleStyle: {
        font: "Pretendard",
        size: 108,
        color: "#ffffff",
        outlineColor: "#000000",
        outlineWidth: 12,
        position: "bottom",
        background: { color: "#000000", opacity: 0.75, padding: 24 },
        margin: 120,
      },
    };
    const result = validateCueSheet(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.subtitleStyle.margin).toBe(120);
      expect(result.data.subtitleStyle.background?.padding).toBe(24);
    }
  });

  it("narration.volume 미지정 시 기본값 1.0이 적용된다", () => {
    const input = {
      ...(sample as Record<string, unknown>),
      narration: { enabled: true, dir: "/narration" },
    };
    const result = validateCueSheet(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.narration?.volume).toBe(1.0);
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
      expect(result.errors.some((e) => e.includes("at least 1"))).toBe(true);
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

  it("narration.volume이 범위를 벗어나면 실패한다", () => {
    const bad = {
      ...(sample as Record<string, unknown>),
      narration: { enabled: true, dir: "/narration", volume: 1.5 },
    };
    const result = validateCueSheet(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("narration.volume"))).toBe(true);
    }
  });

  it("crop이 범위를 벗어나면(x+w>1) 실패한다", () => {
    const bad = {
      ...(sample as Record<string, unknown>),
      segments: [
        { clip: "a.mp4", in: 0, out: 1, subtitle: "", crop: { x: 0.5, y: 0, w: 0.7, h: 0.5 } },
      ],
    };
    const result = validateCueSheet(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("segments[0].crop.x"))).toBe(true);
    }
  });

  it("segment.styleOverride에 잘못된 색상이 있으면 실패한다", () => {
    const bad = {
      ...(sample as Record<string, unknown>),
      segments: [
        { clip: "a.mp4", in: 0, out: 1, subtitle: "", styleOverride: { color: "not-a-hex" } },
      ],
    };
    const result = validateCueSheet(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("segments[0].styleOverride.color"))).toBe(
        true,
      );
    }
  });

  it("segment.narration이 빈 문자열이면 실패한다", () => {
    const bad = {
      ...(sample as Record<string, unknown>),
      segments: [{ clip: "a.mp4", in: 0, out: 1, subtitle: "", narration: "" }],
    };
    const result = validateCueSheet(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("segments[0].narration"))).toBe(true);
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

  it("margin이 상한(600)을 넘으면 실패한다", () => {
    const input = {
      ...(sample as Record<string, unknown>),
      subtitleStyle: {
        font: "Pretendard",
        size: 48,
        color: "#ffffff",
        outlineColor: "#000000",
        outlineWidth: 2,
        position: "bottom",
        margin: 601,
      },
    };
    const result = validateCueSheet(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("margin"))).toBe(true);
    }
  });

  it("background.padding이 상한(120)을 넘으면 실패한다", () => {
    const input = {
      ...(sample as Record<string, unknown>),
      subtitleStyle: {
        font: "Pretendard",
        size: 48,
        color: "#ffffff",
        outlineColor: "#000000",
        outlineWidth: 2,
        position: "bottom",
        background: { color: "#000000", opacity: 0.75, padding: 121 },
      },
    };
    const result = validateCueSheet(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("padding"))).toBe(true);
    }
  });
});
