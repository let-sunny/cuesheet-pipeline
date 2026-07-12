import { readFileSync } from "node:fs";
import { join } from "node:path";
import { formatIssue } from "@cuesheet/schema";
import { z } from "zod";
import type { AssembleGrammarConfig } from "./assemble.js";
import { clipMomentsSchema, momentSchema } from "./types.js";

/**
 * Loads a domain "theme" bundle (domains/<name>/) - the genre-specific knowledge lifted out of
 * the engine (shot vocabulary, editing-grammar numbers, face policy). The engine stays
 * domain-agnostic and reads a bundle at runtime; it never imports domains/ at build time. Voice
 * is a separate personal layer (generated from transcripts), not part of the theme bundle.
 */
export const shotTypesFileSchema = z
  .array(z.object({ id: z.string().min(1), label: z.string().min(1) }))
  .min(1, "shot-types.json must list at least one shot type");

export const grammarFileSchema = z.object({
  qualityThreshold: z.number(),
  cutRhythm: z.object({
    minCutS: z.number(),
    maxCutS: z.number(),
    avgTriggerS: z.number(),
    avgHighS: z.number(),
    trimStepS: z.number(),
  }),
  timelapseConnector: z.object({
    speed: z.number(),
    minSliceS: z.number(),
    maxSliceS: z.number(),
    capPerEpisode: z.number(),
  }),
  boundaryPadS: z.number(),
});

export const facePolicyFileSchema = z.object({
  enabled: z.boolean(),
  standard: z.string(),
  memoTag: z.string(),
  violationQuality: z.number(),
  heuristic: z.object({ partWords: z.array(z.string()), riskWord: z.string() }),
  prose: z.string(),
});

export interface DomainBundle {
  shotTypeIds: string[];
  shotTypeLabels: Record<string, string>;
  grammar: z.infer<typeof grammarFileSchema>;
  facePolicy: z.infer<typeof facePolicyFileSchema>;
}

/** Reads and validates the theme bundle at `dir` (throws `path: field-path: reason` on failure). */
export function loadDomainBundle(dir: string): DomainBundle {
  const shotTypes = parseBundleFile(join(dir, "shot-types.json"), shotTypesFileSchema);
  const grammar = parseBundleFile(join(dir, "grammar.json"), grammarFileSchema);
  const facePolicy = parseBundleFile(join(dir, "face-policy.json"), facePolicyFileSchema);
  return {
    shotTypeIds: shotTypes.map((s) => s.id),
    shotTypeLabels: Object.fromEntries(shotTypes.map((s) => [s.id, s.label])),
    grammar,
    facePolicy,
  };
}

/**
 * Maps a bundle to the engine's AssembleGrammarConfig. The face heuristic lives under the domain's
 * face policy (decision C: engine keeps the face-exclusion mechanism, the domain owns the policy),
 * so it's merged back in here - the engine type stays untouched.
 */
export function resolveDomainAssembleConfig(bundle: DomainBundle): AssembleGrammarConfig {
  return { ...bundle.grammar, faceHeuristic: bundle.facePolicy.heuristic };
}

/**
 * A moments.json schema narrowed to this domain's shot vocabulary. The engine's `momentsFileSchema`
 * accepts any `shotType` string (open at the engine level); this restricts it to `shotTypeIds`, so
 * a domain-aware caller (the assemble CLI with `--domain`) rejects out-of-vocabulary shot types.
 */
export function momentsFileSchemaFor(bundle: DomainBundle) {
  const shotType = z.enum(bundle.shotTypeIds as [string, ...string[]]);
  const moment = momentSchema.extend({ shotType });
  const clip = clipMomentsSchema.extend({ moments: z.array(moment) });
  return z.array(clip);
}

function parseBundleFile<T>(path: string, schema: z.ZodType<T>): T {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf-8"));
  } catch (e) {
    throw new Error(`${path}: ${e instanceof Error ? e.message : String(e)}`);
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new Error(`${path}: ${result.error.issues.map(formatIssue).join("; ")}`);
  }
  return result.data;
}
