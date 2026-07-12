import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_ASSEMBLE_CONFIG } from "../src/assemble.js";
import { loadDomainBundle, resolveDomainAssembleConfig } from "../src/domain.js";
import { shotTypeSchema } from "../src/types.js";

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
  it("knitting shot-type ids equal the engine's current shotType vocabulary", () => {
    expect(loadDomainBundle(KNITTING).shotTypeIds).toEqual([...shotTypeSchema.options]);
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
