import type { Segment } from "@cuesheet/schema";
import type { ClipMoments, ShotType } from "../api.js";
import { baseName } from "../clipPaths.js";

export type SceneInfo =
  | { kind: "moment"; memo: string; shotType: ShotType; inS: number; outS: number }
  | { kind: "monotonous"; memo: string; inS: number; outS: number }
  | { kind: "summary"; memo: string }
  | { kind: "none" };

/**
 * 세그먼트 in이 순간/배속구간의 [start,end] 밖이라도 이 허용치(초) 안이면 매칭으로 본다.
 * coarse-to-fine 탐색으로 뽑은 초벌 in 지점이 실제 하이라이트 경계와 몇 초 어긋날 수
 * 있어서(STATUS.md 참고), 정확 일치 대신 근접 허용 매칭이 필요하다.
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
 * 세그먼트가 초벌 비전 판독(moments.json)의 어느 순간/배속구간/클립요약에 해당하는지
 * 찾는다. 편집 화면에서 "이 컷이 무슨 장면인가"를 보여주기 위한 매칭 규칙:
 * 1) 같은 clip 파일 + in이 moment의 [inS,outS] 안(±허용치 근접 포함)이면 그 memo.
 * 2) 배속 컷(speed !== 1)은 같은 방식으로 monotonousRanges에서 찾는다.
 * 3) 둘 다 없으면 clipSummary로 폴백.
 * 4) 그마저 없으면(clip 자체가 순간 데이터에 없음) "없음".
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
