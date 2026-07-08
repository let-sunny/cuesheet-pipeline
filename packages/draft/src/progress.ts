import { z } from "zod";
import type { Manifest } from "./scan.js";

/**
 * "실수/풀기(frogging) 서사" 감지 프로토타입: 단일 프레임 판독으론 편물이 자라는 중인지
 * 줄어드는(풀리는) 중인지 알 수 없다 — 시간축 인접 프레임 쌍을 Claude가 비교 판독해야
 * 잡힌다. 롱테이크(5분 이상)만 대상으로 한다 — 짧은 클립엔 이 서사가 나올 시간이 없다.
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
 * manifest의 클립별 프레임 시퀀스에서 인접 프레임 쌍 스케줄을 만든다.
 * minDurS 미만인 클립은 제외(기본 300초=5분).
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
 * progress.json 스키마(zod). 프레임 쌍마다 Claude가 두 프레임을 보고 작성하는 판정.
 * shrank = 편물이 줄어듦(바늘에서 빠짐/실뭉치로 되돌아감 등) = 풀기(frogging) 신호.
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
 * 판정 배열에서 실수/풀기 서사 이벤트를 뽑는다. 클립별로 tA 오름차순 정렬 후
 * "마지막 유효 상태"(same/unclear/저신뢰를 건너뛴 최근 grew|shrank)의 전이를 본다 —
 * 롱테이크는 인접 쌍 대부분이 same이라 인접 전이만 보면 이벤트가 과소 발화된다(실측).
 * - mistake_discovered: 유효 상태가 shrank가 아니었다가 shrank가 되는 경계.
 * - resumed: 유효 상태가 shrank였다가 grew로 돌아오는 경계(다시 뜨기 시작).
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
