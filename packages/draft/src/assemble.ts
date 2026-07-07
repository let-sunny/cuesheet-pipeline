import type { CueSheetInput } from "@cuesheet/schema";
import type { ClipMoments, MonotonousRange } from "./types.js";

/**
 * assemble 단계: moments.json(비전 판단 결과)을 결정적 규칙으로 큐시트로 조립한다.
 * 순수 함수 — 검증(validateCueSheet)은 호출부(CLI)에서 별도로 수행한다.
 */

const DEFAULT_FPS = 30;
const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 720;

/** 정속 하이라이트로 채택하는 최소 quality. */
const MIN_QUALITY = 3;

/** 정속 컷 개별 길이 범위(초) — 사용자 실측 리듬(평균 2.95s) 기준. */
const MIN_CUT_S = 2;
const MAX_CUT_S = 3.5;
/** 전체 평균이 이 값을 넘으면 수렴 패스를 돌린다. */
const AVG_TRIGGER_S = 3.1;
/** 수렴 목표 상한(하한은 2.8 — 트림 단위가 작아 보통 이 범위 안에 떨어진다). */
const AVG_HIGH_S = 3.0;
const TRIM_STEP_S = 0.25;

/** 배속 커넥터 배속(12~16 범위의 중간값 — 30~60초 슬라이스를 2.1~4.3초 출력으로 압축). */
const SPEEDUP_SPEED = 14;
const SPEEDUP_MIN_SLICE_S = 30;
const SPEEDUP_MAX_SLICE_S = 60;
/** 에피소드당 배속 커넥터 상한(남발 방지). */
const SPEEDUP_CAP = 8;

/**
 * 정속 하이라이트 컷 경계에 기본으로 주는 여유 패딩(초). 동작(뜨개 손짓)이 완성되기 전에
 * 잘리는 문제를 막기 위함 — Vrew "호흡 안 지킴" 불만, Descript 'Avoid harsh cuts' 참고.
 */
const DEFAULT_BOUNDARY_PAD_S = 0.4;

export interface AssembleOptions {
  clipDir: string;
  projectName: string;
  fps?: number;
  width?: number;
  height?: number;
  /** 정속 하이라이트 컷 경계 패딩(초). 기본 0.4 — 0으로 주면 패딩 없이 조립한다. */
  boundaryPadS?: number;
  /** 클립별 실제 길이(초, manifest.json의 durS) — 경계 패딩이 클립 끝을 넘지 않게 클램프하는 데 쓴다. 없는 클립은 클램프 생략. */
  clipDurations?: Record<string, number>;
}

/**
 * 배속 커넥터 후보 구간의 얼굴 노출 위험 여부. faceExposed가 명시되면 그대로 따르고,
 * 없으면 desc 텍스트 휴리스틱으로 폴백한다(얼굴 부위 단어 + "노출"이 동시에 있으면 위험 —
 * 보수적으로 애매하면 위험 쪽으로 판정한다. 실측: 비전 판독이 "입술이 거의 항상 노출"처럼
 * "얼굴" 없이 부위명으로만 쓰는 경우가 있어 부위 어휘를 함께 본다).
 */
function isMonotonousRangeRisky(r: MonotonousRange): boolean {
  if (typeof r.faceExposed === "boolean") return r.faceExposed;
  const facePart = ["얼굴", "입술", "눈~입", "이목구비"].some((w) => r.desc.includes(w));
  return facePart && r.desc.includes("노출");
}

interface Candidate {
  inS: number;
  outS: number;
  speed: number;
  volume: number;
  subtitle: string;
}

type DraftSegment = { clip: string; in: number; out: number; speed: number; volume: number; subtitle: string };

/**
 * 정속 컷(speed===1)의 전체 평균 길이가 AVG_TRIGGER_S(3.1초)를 넘으면, 가장 긴 컷부터
 * 0.25초씩 다듬어 평균을 2.8~3.0초 범위로 수렴시키는 단순 그리디 패스.
 * 배속 커넥터(speed!==1)는 건드리지 않는다. 세그먼트 객체를 직접 변형한다.
 * 다듬을 때는 in/out 양끝에서 대칭으로 줄인다 — 경계 패딩으로 확보한 동작 중심이
 * 한쪽으로만 깎여 무의미해지지 않게 하기 위함.
 */
function convergeSteadyCutAverage(segments: DraftSegment[]): void {
  const steady = segments.filter((s) => s.speed === 1);
  if (steady.length === 0) return;

  const average = () => steady.reduce((sum, s) => sum + (s.out - s.in), 0) / steady.length;

  if (average() <= AVG_TRIGGER_S) return;

  let guard = steady.length * 100; // 무한루프 방지 — 이 이상 다듬을 일은 없다.
  while (average() > AVG_HIGH_S && guard-- > 0) {
    let longest = steady[0] as DraftSegment;
    for (const s of steady) {
      if (s.out - s.in > longest.out - longest.in) longest = s;
    }
    const curLen = longest.out - longest.in;
    if (curLen <= MIN_CUT_S) break; // 더 다듬을 여지가 없다.
    const newLen = Math.max(MIN_CUT_S, curLen - TRIM_STEP_S);
    const center = (longest.in + longest.out) / 2;
    longest.in = center - newLen / 2;
    longest.out = center + newLen / 2;
  }
}

/**
 * moments.json을 조립 규칙(quality 필터, 배속 커넥터 삽입, 시간순 정렬)에 따라
 * 큐시트 입력으로 변환한다. 반환값은 아직 검증 전(CueSheetInput) — 호출부가
 * validateCueSheet로 검증한다.
 */
export function assembleDraft(clipsMoments: ClipMoments[], options: AssembleOptions): CueSheetInput {
  const sortedClips = [...clipsMoments].sort((a, b) => a.clip.localeCompare(b.clip));
  const padS = options.boundaryPadS ?? DEFAULT_BOUNDARY_PAD_S;

  const segments: DraftSegment[] = [];
  let speedupCount = 0;

  for (const cm of sortedClips) {
    const clipDur = options.clipDurations?.[cm.clip] ?? Number.POSITIVE_INFINITY;

    const steadyCandidates: Candidate[] = [];
    for (const m of cm.moments) {
      if (m.quality >= MIN_QUALITY) {
        let inS = Math.max(0, m.inS - padS);
        let outS = Math.min(clipDur, m.outS + padS);
        const len = outS - inS;
        if (len > MAX_CUT_S) {
          // 패딩 포함 길이가 상한을 넘으면 양끝을 대칭으로 줄인다(동작 중심 유지) —
          // 한쪽만 자르면 방금 준 패딩을 그대로 도로 깎아 먹어 의미가 없어진다.
          const excess = len - MAX_CUT_S;
          inS += excess / 2;
          outS -= excess / 2;
        }
        steadyCandidates.push({ inS, outS, speed: 1, volume: 1, subtitle: m.memo });
      }
    }
    steadyCandidates.sort((a, b) => a.inS - b.inS);
    // 같은 클립 내 인접 컷끼리 패딩으로 겹치면, 겹치지 않는 만큼만 패딩이 남도록
    // 겹친 폭을 반씩 되돌린다.
    for (let i = 0; i < steadyCandidates.length - 1; i++) {
      const cur = steadyCandidates[i] as Candidate;
      const next = steadyCandidates[i + 1] as Candidate;
      const overlap = cur.outS - next.inS;
      if (overlap > 0) {
        const half = overlap / 2;
        cur.outS -= half;
        next.inS += half;
      }
    }

    const candidates: Candidate[] = [...steadyCandidates];

    for (const r of cm.monotonousRanges) {
      if (speedupCount >= SPEEDUP_CAP) break;
      if (isMonotonousRangeRisky(r)) {
        console.log(`[assemble] ${cm.clip} ${r.startS}-${r.endS}s: 얼굴 노출 위험으로 배속 커넥터 건너뜀`);
        continue;
      }
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

  convergeSteadyCutAverage(segments);

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
