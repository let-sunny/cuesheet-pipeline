import type { CueSheetInput } from "@cuesheet/schema";
import type { ClipMoments } from "./types.js";

/**
 * assemble 단계: moments.json(비전 판단 결과)을 결정적 규칙으로 큐시트로 조립한다.
 * 순수 함수 — 검증(validateCueSheet)은 호출부(CLI)에서 별도로 수행한다.
 */

const DEFAULT_FPS = 30;
const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 720;

/** 정속 하이라이트로 채택하는 최소 quality. */
const MIN_QUALITY = 3;

/** 배속 커넥터 배속(12~16 범위의 중간값 — 30~60초 슬라이스를 2.1~4.3초 출력으로 압축). */
const SPEEDUP_SPEED = 14;
const SPEEDUP_MIN_SLICE_S = 30;
const SPEEDUP_MAX_SLICE_S = 60;
/** 에피소드당 배속 커넥터 상한(남발 방지). */
const SPEEDUP_CAP = 8;

export interface AssembleOptions {
  clipDir: string;
  projectName: string;
  fps?: number;
  width?: number;
  height?: number;
}

interface Candidate {
  inS: number;
  outS: number;
  speed: number;
  volume: number;
  subtitle: string;
}

/**
 * moments.json을 조립 규칙(quality 필터, 배속 커넥터 삽입, 시간순 정렬)에 따라
 * 큐시트 입력으로 변환한다. 반환값은 아직 검증 전(CueSheetInput) — 호출부가
 * validateCueSheet로 검증한다.
 */
export function assembleDraft(clipsMoments: ClipMoments[], options: AssembleOptions): CueSheetInput {
  const sortedClips = [...clipsMoments].sort((a, b) => a.clip.localeCompare(b.clip));

  const segments: { clip: string; in: number; out: number; speed: number; volume: number; subtitle: string }[] = [];
  let speedupCount = 0;

  for (const cm of sortedClips) {
    const candidates: Candidate[] = [];

    for (const m of cm.moments) {
      if (m.quality >= MIN_QUALITY) {
        candidates.push({ inS: m.inS, outS: m.outS, speed: 1, volume: 1, subtitle: m.memo });
      }
    }

    for (const r of cm.monotonousRanges) {
      if (speedupCount >= SPEEDUP_CAP) break;
      const fullDur = r.endS - r.startS;
      if (fullDur < SPEEDUP_MIN_SLICE_S) continue;
      const sliceDur = Math.min(fullDur, SPEEDUP_MAX_SLICE_S);
      candidates.push({
        inS: r.startS,
        outS: r.startS + sliceDur,
        speed: SPEEDUP_SPEED,
        volume: 1,
        subtitle: `(빨리감기) ${r.desc}`,
      });
      speedupCount++;
    }

    candidates.sort((a, b) => a.inS - b.inS);
    for (const c of candidates) {
      segments.push({ clip: cm.clip, in: c.inS, out: c.outS, speed: c.speed, volume: c.volume, subtitle: c.subtitle });
    }
  }

  return {
    project: {
      name: options.projectName,
      fps: options.fps ?? DEFAULT_FPS,
      width: options.width ?? DEFAULT_WIDTH,
      height: options.height ?? DEFAULT_HEIGHT,
    },
    clipDir: options.clipDir,
    intro: null,
    outro: null,
    segments,
    bgm: [],
    subtitleStyle: {
      font: "Pretendard",
      size: 36,
      color: "#ffffff",
      outlineColor: "#000000",
      outlineWidth: 3,
      position: "bottom",
    },
  };
}
