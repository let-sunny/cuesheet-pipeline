import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_ASSEMBLE_CONFIG } from "../src/assemble.js";
import { loadDomainBundle, momentsFileSchemaFor, resolveDomainAssembleConfig } from "../src/domain.js";
import { momentsFileSchema } from "../src/types.js";

// The knitting vocabulary, as a literal - the engine's shotType is now an open string, so the pin
// asserts the bundle still names exactly these ids.
const KNITTING_SHOT_IDS = ["hand-closeup", "object", "cat", "change", "reveal", "wearing", "other"];

// Repo-root/domains/knitting, resolved from this file (works regardless of the cwd vitest runs in).
const KNITTING = fileURLToPath(new URL("../../../domains/knitting", import.meta.url));

describe("loadDomainBundle (knitting)", () => {
  it("loads shot types with ids and labels", () => {
    const bundle = loadDomainBundle(KNITTING);
    expect(bundle.shotTypeIds).toContain("hand-closeup");
    expect(bundle.shotTypeLabels["cat"]).toBe("Cat");
  });

  it("throws a path-prefixed error for a missing/invalid bundle dir", () => {
    expect(() => loadDomainBundle(fileURLToPath(new URL("../../../domains/nope", import.meta.url)))).toThrow(
      /domains\/nope\/shot-types\.json/,
    );
  });
});

describe("no-drift pins (the knitting bundle must equal the engine defaults it was lifted from)", () => {
  it("knitting shot-type ids equal the expected vocabulary", () => {
    expect(loadDomainBundle(KNITTING).shotTypeIds).toEqual(KNITTING_SHOT_IDS);
  });

  it("knitting grammar + face policy resolve to DEFAULT_ASSEMBLE_CONFIG", () => {
    // Deep-equal guards both value drift and structural drift: if AssembleGrammarConfig gains a
    // field, DEFAULT gets it but the bundle won't, so this fails and forces the bundle to update.
    expect(resolveDomainAssembleConfig(loadDomainBundle(KNITTING))).toEqual(DEFAULT_ASSEMBLE_CONFIG);
  });

  it("knitting face heuristic equals the engine's default face heuristic", () => {
    expect(loadDomainBundle(KNITTING).facePolicy.heuristic).toEqual(DEFAULT_ASSEMBLE_CONFIG.faceHeuristic);
  });
});

describe("momentsFileSchemaFor (domain-narrowed shot vocabulary)", () => {
  const clipWith = (shotType: string) => [
    {
      clip: "a.mp4",
      clipSummary: "",
      monotonousRanges: [],
      moments: [{ inS: 0, outS: 1, shotType, memo: "", quality: 3 }],
    },
  ];

  it("the bare engine schema accepts an unknown shotType (open-string)", () => {
    expect(momentsFileSchema.safeParse(clipWith("plating")).success).toBe(true);
  });

  it("the domain schema accepts a known shotType", () => {
    const schema = momentsFileSchemaFor(loadDomainBundle(KNITTING));
    expect(schema.safeParse(clipWith("cat")).success).toBe(true);
  });

  it("the domain schema rejects an out-of-vocabulary shotType", () => {
    const schema = momentsFileSchemaFor(loadDomainBundle(KNITTING));
    expect(schema.safeParse(clipWith("plating")).success).toBe(false);
  });
});
