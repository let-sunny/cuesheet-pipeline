import type { Segment } from "@cuesheet/schema";
import type { ClipMoments, ShotType } from "../api.js";
import { baseName } from "../clipPaths.js";

export type SceneInfo =
  | { kind: "moment"; memo: string; shotType: ShotType; inS: number; outS: number }
  | { kind: "monotonous"; memo: string; inS: number; outS: number }
  | { kind: "summary"; memo: string }
  | { kind: "none" };

/**
 * If a segment's in is outside a moment's/speed-range's [start,end] but within this tolerance
 * (seconds), it still counts as a match. Because the rough in-point found by coarse-to-fine search
 * can be off from the real highlight boundary by a few seconds (see STATUS.md), we need tolerant
 * proximity matching instead of exact matching.
 */
const MATCH_TOLERANCE_S = 3;

const SHOT_TYPE_LABEL: Record<ShotType, string> = {
  "hand-closeup": "Hand",
  object: "Object",
  cat: "Cat",
  change: "Change",
  reveal: "Reveal",
  wearing: "Wearing",
  other: "Other",
};

export function shotTypeLabel(shotType: ShotType): string {
  return SHOT_TYPE_LABEL[shotType];
}

function withinTolerance(t: number, startS: number, endS: number): boolean {
  return t >= startS - MATCH_TOLERANCE_S && t <= endS + MATCH_TOLERANCE_S;
}

/**
 * Finds which moment/speed-range/clip summary in the rough vision reading (moments.json) a segment
 * corresponds to. Matching rule used to show "what scene is this cut" in the edit screen:
 * 1) Same clip file + in falls inside a moment's [inS,outS] (including ± tolerance) -> that memo.
 * 2) A speed cut (speed !== 1) is looked up the same way in monotonousRanges.
 * 3) If neither matches, fall back to clipSummary.
 * 4) If even that is missing (the clip itself isn't in the moment data), "none".
 */
export function matchSceneInfo(
  segment: Pick<Segment, "clip" | "in" | "speed">,
  moments: ClipMoments[],
): SceneInfo {
  const clipFileName = baseName(segment.clip);
  const entry = moments.find((m) => baseName(m.clip) === clipFileName);
  if (!entry) {
    return { kind: "none" };
  }

  const moment = entry.moments.find((m) => withinTolerance(segment.in, m.inS, m.outS));
  if (moment) {
    return {
      kind: "moment",
      memo: moment.memo,
      shotType: moment.shotType,
      inS: moment.inS,
      outS: moment.outS,
    };
  }

  if (segment.speed !== 1) {
    const range = entry.monotonousRanges.find((r) => withinTolerance(segment.in, r.startS, r.endS));
    if (range) {
      return { kind: "monotonous", memo: range.desc, inS: range.startS, outS: range.endS };
    }
  }

  if (entry.clipSummary.trim() !== "") {
    return { kind: "summary", memo: entry.clipSummary };
  }

  return { kind: "none" };
}
