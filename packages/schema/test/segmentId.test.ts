import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ensureSegmentIds, newSegmentId, validateCueSheet } from "../src/index.js";
import type { CueSheet } from "../src/types.js";

const sample = JSON.parse(
  readFileSync(fileURLToPath(new URL("../examples/sample.cuesheet.json", import.meta.url)), "utf-8"),
) as Record<string, unknown>;

/** A valid cuesheet with the given segments spread over the example base. */
function withSegments(segments: unknown[]): unknown {
  return { ...sample, segments };
}

describe("segment id validation", () => {
  it("a cuesheet without ids is valid (ids are stamped at write time, not required by the schema)", () => {
    const result = validateCueSheet(withSegments([{ clip: "a.mp4", in: 0, out: 1, subtitle: "" }]));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.segments[0]?.id).toBeUndefined();
  });

  it("accepts unique ids", () => {
    const result = validateCueSheet(
      withSegments([
        { id: "s1", clip: "a.mp4", in: 0, out: 1, subtitle: "" },
        { id: "s2", clip: "b.mp4", in: 0, out: 1, subtitle: "" },
      ]),
    );
    expect(result.ok).toBe(true);
  });

  it("rejects duplicate ids with a field-path: reason message", () => {
    const result = validateCueSheet(
      withSegments([
        { id: "dup", clip: "a.mp4", in: 0, out: 1, subtitle: "" },
        { id: "dup", clip: "b.mp4", in: 0, out: 1, subtitle: "" },
      ]),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => /segments\[1\]\.id: duplicate segment id "dup"/.test(e))).toBe(true);
    }
  });
});

describe("ensureSegmentIds", () => {
  function validCue(segments: unknown[]): CueSheet {
    const r = validateCueSheet(withSegments(segments));
    if (!r.ok) throw new Error(`fixture invalid: ${r.errors.join(", ")}`);
    return r.data;
  }

  it("assigns an id to every id-less segment", () => {
    const cue = validCue([
      { clip: "a.mp4", in: 0, out: 1, subtitle: "" },
      { clip: "b.mp4", in: 0, out: 1, subtitle: "" },
    ]);
    const out = ensureSegmentIds(cue);
    expect(out.segments.every((s) => typeof s.id === "string" && s.id.length > 0)).toBe(true);
    expect(out.segments[0]?.id).not.toBe(out.segments[1]?.id);
  });

  it("preserves existing ids and only fills the missing ones", () => {
    const cue = validCue([
      { id: "keep", clip: "a.mp4", in: 0, out: 1, subtitle: "" },
      { clip: "b.mp4", in: 0, out: 1, subtitle: "" },
    ]);
    const out = ensureSegmentIds(cue);
    expect(out.segments[0]?.id).toBe("keep");
    expect(out.segments[1]?.id).toBeDefined();
  });

  it("is idempotent (a second pass changes nothing)", () => {
    const once = ensureSegmentIds(validCue([{ clip: "a.mp4", in: 0, out: 1, subtitle: "" }]));
    const twice = ensureSegmentIds(once);
    expect(twice.segments.map((s) => s.id)).toEqual(once.segments.map((s) => s.id));
  });

  it("keeps the output a valid cuesheet", () => {
    const out = ensureSegmentIds(validCue([{ clip: "a.mp4", in: 0, out: 1, subtitle: "" }]));
    expect(validateCueSheet(out).ok).toBe(true);
  });
});

describe("newSegmentId", () => {
  it("returns distinct non-empty strings", () => {
    const ids = new Set(Array.from({ length: 50 }, () => newSegmentId()));
    expect(ids.size).toBe(50);
    expect([...ids].every((id) => id.length > 0)).toBe(true);
  });
});
