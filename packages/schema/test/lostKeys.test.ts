import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { findLostFieldPaths, validateCueSheet } from "../src/index.js";

const sample = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../examples/sample.cuesheet.json", import.meta.url)),
    "utf-8",
  ),
) as unknown;

describe("findLostFieldPaths", () => {
  it("정상 저장(유실 없음)이면 빈 배열을 준다", () => {
    const result = validateCueSheet(sample);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(findLostFieldPaths(sample, result.data)).toEqual([]);
  });

  it("스키마가 모르는 최상위 키는 유실로 감지된다(zod strip)", () => {
    const withUnknown = { ...(sample as Record<string, unknown>), notInSchema: "x" };
    const result = validateCueSheet(withUnknown);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const lost = findLostFieldPaths(withUnknown, result.data);
    expect(lost).toContain("notInSchema");
  });

  it("스키마가 모르는 세그먼트 안 키는 경로와 함께 유실로 감지된다(zod strip)", () => {
    const withUnknown = {
      ...(sample as Record<string, unknown>),
      segments: [
        { clip: "a.mp4", in: 0, out: 1, subtitle: "", totallyUnknownField: "x" },
      ],
    };
    const result = validateCueSheet(withUnknown);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const lost = findLostFieldPaths(withUnknown, result.data);
    expect(lost).toContain("segments[0].totallyUnknownField");
  });

  it("undefined였던 값은 유실로 치지 않는다", () => {
    expect(findLostFieldPaths({ a: undefined }, {})).toEqual([]);
  });

  it("값이 바뀌어도(타입 강제·기본값 채움) 키가 남아있으면 유실이 아니다", () => {
    expect(findLostFieldPaths({ a: 1 }, { a: 2, b: 3 })).toEqual([]);
  });
});
