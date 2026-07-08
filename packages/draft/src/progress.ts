import { z } from "zod";
import type { Manifest } from "./scan.js";

/**
 * Prototype for detecting "mistake / frogging" narratives: a single-frame reading can't
 * tell whether the knitted piece is growing or shrinking (being frogged/undone) — this
 * requires Claude to compare adjacent frame pairs along the time axis. Only long-take
 * clips (5+ minutes) are targeted — short clips don't have time for this narrative to unfold.
 */

const LONGTAKE_MIN_DUR_S = 300;

export interface FramePair {
  clip: string;
  tA: number;
  tB: number;
  frameA: string;
  frameB: string;
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
 * progress.json schema (zod). The judgment Claude writes for each frame pair after
 * looking at both frames. shrank = the knitted piece got smaller (came off the needles,
 * reverted to yarn, etc.) = a frogging signal.
 */
export const progressVerdictSchema = z.enum(["grew", "shrank", "same", "unclear"]);

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

export type NarrativeEventType = "mistake_discovered" | "resumed";

export interface NarrativeEvent {
  clip: string;
  type: NarrativeEventType;
  atS: number;
  note: string;
}

/**
 * Extracts mistake/frogging narrative events from an array of judgments. Sorts by tA
 * ascending per clip, then looks at transitions in the "last valid state" (the most recent
 * grew|shrank, skipping over same/unclear/low-confidence) — in long takes, most adjacent
 * pairs are "same", so looking only at adjacent transitions under-fires events (observed
 * in practice).
 * - mistake_discovered: the boundary where the valid state was not shrank and becomes shrank.
 * - resumed: the boundary where the valid state was shrank and returns to grew (knitting resumes).
 */
export function extractNarrativeEvents(
  judgments: ProgressJudgment[],
  minConfidence = 3,
): NarrativeEvent[] {
  const byClip = new Map<string, ProgressJudgment[]>();
  for (const j of judgments) {
    const list = byClip.get(j.clip) ?? [];
    list.push(j);
    byClip.set(j.clip, list);
  }

  const events: NarrativeEvent[] = [];
  for (const [clip, list] of byClip) {
    const sorted = [...list].sort((a, b) => a.tA - b.tA);
    let state: "grew" | "shrank" | undefined;
    for (const cur of sorted) {
      if (cur.confidence < minConfidence) continue;
      if (cur.verdict !== "grew" && cur.verdict !== "shrank") continue;
      if (cur.verdict === "shrank" && state !== "shrank") {
        events.push({ clip, type: "mistake_discovered", atS: cur.tA, note: cur.note });
      } else if (cur.verdict === "grew" && state === "shrank") {
        events.push({ clip, type: "resumed", atS: cur.tA, note: cur.note });
      }
      state = cur.verdict;
    }
  }

  return events.sort((a, b) => a.clip.localeCompare(b.clip) || a.atS - b.atS);
}
