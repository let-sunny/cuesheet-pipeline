import { z } from "zod";
import type { Manifest } from "./scan.js";

/**
 * Prototype for detecting "mistake / frogging" narratives: a single-frame reading can't
 * tell whether the knitted piece is growing or shrinking (being frogged/undone) — this
 * requires Claude to compare adjacent frame pairs along the time axis. Only long-take
 * clips (5+ minutes) are targeted — short clips don't have time for this narrative to unfold.
 */

export interface FramePair {
  clip: string;
  tA: number;
  tB: number;
  frameA: string;
  frameB: string;
}

/**
 * progress.json schema (zod). The judgment Claude writes for each frame pair after
 * looking at both frames. The verdict vocabulary is domain data (the knitting
 * grew/shrank/same/unclear lives in `domains/knitting/narrative.json`), so the engine
 * schema keeps `verdict` an open string - mirroring `shotType` - and a domain-aware
 * caller narrows it via `progressFileSchemaFor(bundle)`.
 */
export const progressVerdictSchema = z.string().min(1);

export const progressJudgmentSchema = z.object({
  clip: z.string(),
  tA: z.number(),
  tB: z.number(),
  verdict: progressVerdictSchema,
  confidence: z.number().min(1).max(5),
  note: z.string(),
});

export const progressFileSchema = z.array(progressJudgmentSchema);

export type ProgressVerdict = z.infer<typeof progressVerdictSchema>;
export type ProgressJudgment = z.infer<typeof progressJudgmentSchema>;

/**
 * The domain-provided narrative rule set (decision B: frogging detection is a domain hook,
 * not baked into the engine). A declarative state-transition table - the documented ceiling
 * of expressiveness. `significantVerdicts` are the verdicts that update the "last valid state"
 * (transient ones like same/unclear are skipped); a transition fires an event when the current
 * verdict equals `to` and the prior state is one of `from` (`null` = no prior state yet).
 */
export interface NarrativeTransition {
  from: (string | null)[];
  to: string;
  event: string;
}

export interface NarrativeConfig {
  significantVerdicts: string[];
  minConfidence: number;
  transitions: NarrativeTransition[];
}

export type NarrativeEventType = string;

export interface NarrativeEvent {
  clip: string;
  type: NarrativeEventType;
  atS: number;
  note: string;
}

/**
 * Builds a schedule of adjacent frame pairs from each clip's frame sequence in the manifest.
 * Clips shorter than minDurS are excluded (default 300s = 5 minutes).
 */
export function buildPairSchedule(manifest: Manifest, minDurS = LONGTAKE_MIN_DUR_S): FramePair[] {
  const pairs: FramePair[] = [];
  for (const clip of manifest.clips) {
    if (clip.durS < minDurS) continue;
    const frames = [...clip.frames].sort((a, b) => a.t - b.t);
    for (let i = 0; i < frames.length - 1; i++) {
      const a = frames[i];
      const b = frames[i + 1];
      if (!a || !b) continue;
      pairs.push({ clip: clip.name, tA: a.t, tB: b.t, frameA: a.path, frameB: b.path });
    }
  }
  return pairs;
}

/**
 * Extracts narrative events from an array of judgments, driven by a domain's declarative
 * transition table (defaults to the knitting rules). Sorts by tA ascending per clip, then
 * tracks the "last valid state" (the most recent significant verdict, skipping over
 * transient/low-confidence pairs) — in long takes, most adjacent pairs are "same", so looking
 * only at adjacent transitions under-fires events (observed in practice). A transition fires
 * when the current verdict matches its `to` and the prior state is one of its `from`.
 */
export function extractNarrativeEvents(
  judgments: ProgressJudgment[],
  config: NarrativeConfig = KNITTING_NARRATIVE_CONFIG,
): NarrativeEvent[] {
  const significant = new Set(config.significantVerdicts);

  const byClip = new Map<string, ProgressJudgment[]>();
  for (const j of judgments) {
    const list = byClip.get(j.clip) ?? [];
    list.push(j);
    byClip.set(j.clip, list);
  }

  const events: NarrativeEvent[] = [];
  for (const [clip, list] of byClip) {
    const sorted = [...list].sort((a, b) => a.tA - b.tA);
    let state: string | null = null;
    for (const cur of sorted) {
      if (cur.confidence < config.minConfidence) continue;
      if (!significant.has(cur.verdict)) continue;
      const transition = config.transitions.find(
        (t) => t.to === cur.verdict && t.from.includes(state),
      );
      if (transition) {
        events.push({ clip, type: transition.event, atS: cur.tA, note: cur.note });
      }
      state = cur.verdict;
    }
  }

  return events.sort((a, b) => a.clip.localeCompare(b.clip) || a.atS - b.atS);
}

const LONGTAKE_MIN_DUR_S = 300;

/**
 * The knitting narrative rules, kept in-engine as the default so `extractNarrativeEvents` and the
 * existing fixtures behave identically. `domains/knitting/narrative.json` mirrors this (a no-drift
 * pin in domain.test.ts guards the two against divergence); a different genre supplies its own.
 * - mistake_discovered: the valid state was not shrank (grew, or nothing yet) and becomes shrank.
 * - resumed: the valid state was shrank and returns to grew (knitting resumes).
 */
export const KNITTING_NARRATIVE_CONFIG: NarrativeConfig = {
  significantVerdicts: ["grew", "shrank"],
  minConfidence: 3,
  transitions: [
    { from: [null, "grew"], to: "shrank", event: "mistake_discovered" },
    { from: ["shrank"], to: "grew", event: "resumed" },
  ],
};
