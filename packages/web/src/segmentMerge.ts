import type { CueSheet } from "@cuesheet/schema";

/** [다음 컷과 합치기]가 가능한지와, 안 되면 그 사유(비활성 버튼 title에 노출)를 반환한다.
    같은 클립이고 시간상 인접(다음 컷 in - 현재 out < 2초)해야 한다. */
export type MergeEligibility = { eligible: true } | { eligible: false; reason: string };

/** 인접 컷 병합 시 두 컷의 in/out 간격을 얼마까지 "인접"으로 볼지(초). */
export const MERGE_ADJACENCY_GAP_S = 2;

export function computeMergeEligibility(draft: CueSheet | null, index: number): MergeEligibility {
  if (!draft) {
    return { eligible: false, reason: "큐시트가 없습니다" };
  }
  const current = draft.segments[index];
  const next = draft.segments[index + 1];
  if (!current) {
    return { eligible: false, reason: "선택된 컷이 없습니다" };
  }
  if (!next) {
    return { eligible: false, reason: "마지막 컷입니다" };
  }
  if (current.clip !== next.clip) {
    return { eligible: false, reason: "다른 클립이라 합칠 수 없습니다" };
  }
  const gap = next.in - current.out;
  if (gap >= MERGE_ADJACENCY_GAP_S) {
    return { eligible: false, reason: `시간상 인접하지 않습니다(간격 ${gap.toFixed(1)}s)` };
  }
  return { eligible: true };
}
