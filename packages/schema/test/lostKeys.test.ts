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

  it("does not treat a wholly undefined original (top-level) as lost", () => {
    expect(findLostFieldPaths(undefined, { a: 1 })).toEqual([]);
  });

  it("is not lost if the key remains even when its value changed (type coercion/default fill)", () => {
    expect(findLostFieldPaths({ a: 1 }, { a: 2, b: 3 })).toEqual([]);
  });

  it("marks the whole value lost (root path) when the serialized side is undefined entirely", () => {
    expect(findLostFieldPaths({ a: 1 }, undefined)).toEqual(["(root)"]);
  });

  it("marks an array as lost (with its path) when the serialized side isn't an array", () => {
    expect(findLostFieldPaths({ list: [1, 2] }, { list: "not-an-array" })).toEqual(["list"]);
  });

  it("marks an object as lost (with its path) when the serialized side is null instead", () => {
    expect(findLostFieldPaths({ nested: { a: 1 } }, { nested: null })).toEqual(["nested"]);
  });

  it("marks an object as lost when the serialized side is an array instead of an object", () => {
    expect(findLostFieldPaths({ nested: { a: 1 } }, { nested: [1] })).toEqual(["nested"]);
  });

  it("marks an object as lost when the serialized side is a primitive instead of an object", () => {
    expect(findLostFieldPaths({ nested: { a: 1 } }, { nested: 5 })).toEqual(["nested"]);
  });

  it("recurses element-wise into arrays, reporting a nested loss with its index in the path", () => {
    const lost = findLostFieldPaths({ list: [{ a: 1 }, { b: 2 }] }, { list: [{ a: 1 }, {}] });
    expect(lost).toEqual(["list[1].b"]);
  });

  it("reports the root path itself as lost when the whole tree is an unrecognized object at the top level", () => {
    expect(findLostFieldPaths({ a: 1 }, [1])).toEqual(["(root)"]);
  });
});
