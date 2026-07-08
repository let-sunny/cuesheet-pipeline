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
  it("gives an empty array on a normal save (no loss)", () => {
    const result = validateCueSheet(sample);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(findLostFieldPaths(sample, result.data)).toEqual([]);
  });

  it("detects a top-level key unknown to the schema as lost (zod strip)", () => {
    const withUnknown = { ...(sample as Record<string, unknown>), notInSchema: "x" };
    const result = validateCueSheet(withUnknown);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const lost = findLostFieldPaths(withUnknown, result.data);
    expect(lost).toContain("notInSchema");
  });

  it("detects a key inside a segment unknown to the schema as lost, with its path (zod strip)", () => {
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

  it("does not treat a value that was undefined as lost", () => {
    expect(findLostFieldPaths({ a: undefined }, {})).toEqual([]);
  });

  it("is not lost if the key remains even when its value changed (type coercion/default fill)", () => {
    expect(findLostFieldPaths({ a: 1 }, { a: 2, b: 3 })).toEqual([]);
  });
});
