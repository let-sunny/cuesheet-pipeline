import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_ASSEMBLE_CONFIG } from "../src/assemble.js";
import {
  loadDomainBundle,
  momentsFileSchemaFor,
  progressFileSchemaFor,
  resolveDomainAssembleConfig,
  resolveNarrativeConfig,
} from "../src/domain.js";
import { KNITTING_NARRATIVE_CONFIG } from "../src/progress.js";
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

  it("knitting narrative.json resolves to KNITTING_NARRATIVE_CONFIG (the engine default)", () => {
    expect(resolveNarrativeConfig(loadDomainBundle(KNITTING))).toEqual(KNITTING_NARRATIVE_CONFIG);
  });
});

describe("narrative bundle (frogging as a domain hook)", () => {
  it("loads the knitting narrative rules (verdicts + quality boosts)", () => {
    const bundle = loadDomainBundle(KNITTING);
    expect(bundle.narrative?.verdicts).toEqual(["grew", "shrank", "same", "unclear"]);
    expect(bundle.narrative?.minDurS).toBe(300);
    expect(bundle.narrative?.qualityBoosts).toEqual({ mistake_discovered: 5, resumed: 4 });
  });

  it("progressFileSchemaFor narrows verdicts to the domain vocabulary", () => {
    const schema = progressFileSchemaFor(loadDomainBundle(KNITTING));
    const judgment = (verdict: string) => [{ clip: "a.mp4", tA: 0, tB: 60, verdict, confidence: 4, note: "" }];
    expect(schema.safeParse(judgment("shrank")).success).toBe(true);
    expect(schema.safeParse(judgment("melted")).success).toBe(false);
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

describe("categories bundle (web palette presentation model)", () => {
  it("loads the knitting categories, shot->category map, memo patterns, and range category", () => {
    const bundle = loadDomainBundle(KNITTING);
    expect(bundle.categories?.categories.find((c) => c.id === "cat")).toEqual({
      id: "cat",
      label: "Cat",
      color: "purple",
    });
    expect(bundle.categories?.shotTypeCategory["hand-closeup"]).toBe("knitting");
    expect(bundle.categories?.rangeCategory).toBe("knit-range");
    expect(bundle.categories?.memoPatterns.map((p) => p.category)).toEqual(["mistake", "outing"]);
  });
});
