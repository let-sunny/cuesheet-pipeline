import type { BgmCue } from "@cuesheet/schema";
import { bgmCutRange } from "./bgmCutMapping.js";

export interface BgmLaneItem {
  bgmIndex: number;
  startCutIdx: number;
  endCutIdx: number;
  lane: number;
}

/**
 * Assigns each bgm cue to a lane (a column in the BGM gutter) such that within one lane, no two
 * cues' cut ranges overlap - overlapping cues (allowed by the schema/user's editing grammar, e.g.
 * a music bed under a shorter sting) land in different lanes and render as parallel columns.
 * Greedy interval scheduling: process cues in start order, put each in the first lane whose last
 * assigned cue ends before this one starts, else open a new lane.
 */
export function assignBgmLanes(bgm: BgmCue[], cumStart: number[]): BgmLaneItem[] {
  const ranges = bgm.map((cue, bgmIndex) => ({ bgmIndex, ...bgmCutRange(cue, cumStart) }));
  const order = [...ranges].sort((a, b) => a.startCutIdx - b.startCutIdx);
  const laneEnds: number[] = [];
  const result: BgmLaneItem[] = [];
  for (const r of order) {
    let lane = laneEnds.findIndex((end) => end < r.startCutIdx);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(r.endCutIdx);
    } else {
      laneEnds[lane] = r.endCutIdx;
    }
    result.push({ bgmIndex: r.bgmIndex, startCutIdx: r.startCutIdx, endCutIdx: r.endCutIdx, lane });
  }
  return result;
}

/** Total number of lanes across all assigned items (0 if bgm is empty). */
export function laneCount(items: BgmLaneItem[]): number {
  return items.reduce((max, it) => Math.max(max, it.lane + 1), 0);
}
