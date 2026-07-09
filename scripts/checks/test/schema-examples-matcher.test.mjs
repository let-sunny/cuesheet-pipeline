import { describe, expect, it } from "vitest";
import { findSchemaExampleViolations } from "../lib/schema-examples-matcher.mjs";

// Fake validateCueSheet: rejects anything without a `project` key, so the matcher's own logic
// (JSON parsing, error formatting, iterating multiple fixtures) is tested independently of the
// real @cuesheet/schema build.
function fakeValidate(parsed) {
  if (parsed && typeof parsed === "object" && "project" in parsed) {
    return { ok: true, data: parsed };
  }
  return { ok: false, errors: ["project: Required"] };
}

describe("findSchemaExampleViolations", () => {
  it("is clean for a fixture that validates", () => {
    const examples = [{ path: "a.cuesheet.json", raw: JSON.stringify({ project: {} }) }];

    expect(findSchemaExampleViolations(examples, fakeValidate)).toEqual([]);
  });

  it("flags a fixture that fails validation, with the schema's own error message", () => {
    const examples = [{ path: "a.cuesheet.json", raw: JSON.stringify({}) }];

    expect(findSchemaExampleViolations(examples, fakeValidate)).toEqual(["a.cuesheet.json: project: Required"]);
  });

  it("flags invalid JSON without calling validateCueSheet", () => {
    const examples = [{ path: "a.cuesheet.json", raw: "{ not json" }];

    const violations = findSchemaExampleViolations(examples, fakeValidate);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/^a\.cuesheet\.json: invalid JSON/);
  });

  it("checks every fixture independently", () => {
    const examples = [
      { path: "good.cuesheet.json", raw: JSON.stringify({ project: {} }) },
      { path: "bad.cuesheet.json", raw: JSON.stringify({}) },
    ];

    expect(findSchemaExampleViolations(examples, fakeValidate)).toEqual(["bad.cuesheet.json: project: Required"]);
  });
});
