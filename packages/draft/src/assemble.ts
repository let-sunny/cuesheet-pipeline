import type { CueSheetInput } from "@cuesheet/schema";
import type { ClipMoments, MonotonousRange } from "./types.js";

/**
 * assemble stage: assembles moments.json (vision judgment results) into a cuesheet
 * using deterministic rules. Pure function — validation (validateCueSheet) is done
 * separately by the caller (CLI).
 */

const DEFAULT_FPS = 30;
const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 720;

/** Minimum quality to accept as a steady-speed highlight. */
const MIN_QUALITY = 3;

/** Individual steady-cut length range (seconds) — based on the user's measured rhythm (avg 2.95s). */
const MIN_CUT_S = 2;
const MAX_CUT_S = 3.5;
/** If the overall average exceeds this value, run the convergence pass. */
const AVG_TRIGGER_S = 3.1;
/** Convergence target upper bound (lower bound is 2.8 — since the trim step is small, it usually lands within this range). */
const AVG_HIGH_S = 3.0;
const TRIM_STEP_S = 0.25;

/** Timelapse connector speed (midpoint of the 12-16 range — compresses a 30-60s slice into 2.1-4.3s of output). */
const SPEEDUP_SPEED = 14;
const SPEEDUP_MIN_SLICE_S = 30;
const SPEEDUP_MAX_SLICE_S = 60;
/** Cap on timelapse connectors per episode (to prevent overuse). */
const SPEEDUP_CAP = 8;

/**
 * Default padding (seconds) added to steady-highlight cut boundaries. Prevents a motion
 * (knitting hand gesture) from being cut off before it completes — see Vrew's "doesn't
 * respect breathing room" complaint and Descript's 'Avoid harsh cuts' reference.
 */
const DEFAULT_BOUNDARY_PAD_S = 0.4;

export interface AssembleOptions {
  clipDir: string;
  projectName: string;
  fps?: number;
  width?: number;
  height?: number;
  /** Steady-highlight cut boundary padding (seconds). Default 0.4 — pass 0 to assemble without padding. */
  boundaryPadS?: number;
  /** Actual per-clip duration (seconds, durS from manifest.json) — used to clamp boundary padding so it doesn't extend past the clip's end. Clips without an entry skip clamping. */
  clipDurations?: Record<string, number>;
}

/**
 * Whether a timelapse-connector candidate range carries face-exposure risk. If faceExposed
 * is explicitly set, follow it as-is; otherwise fall back to a desc-text heuristic (risky if
 * a face-part word and "exposed" both appear — conservatively, treat ambiguous cases as risky.
 * Observed in practice: vision judgments sometimes phrase this using only a part name without
 * the word "face" itself, e.g. "lips are almost always exposed", so part-name vocabulary is
 * checked too).
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
 * If the overall average length of steady cuts (speed===1) exceeds AVG_TRIGGER_S (3.1s),
 * a simple greedy pass trims the longest cut by 0.25s at a time until the average converges
 * into the 2.8-3.0s range. Timelapse connectors (speed!==1) are left untouched. Mutates the
 * segment objects directly. Trimming shrinks symmetrically from both the in/out ends — so the
 * motion-centered framing gained from boundary padding isn't rendered meaningless by trimming
 * from only one side.
 */
function convergeSteadyCutAverage(segments: DraftSegment[]): void {
  const steady = segments.filter((s) => s.speed === 1);
  if (steady.length === 0) return;

  const average = () => steady.reduce((sum, s) => sum + (s.out - s.in), 0) / steady.length;

  if (average() <= AVG_TRIGGER_S) return;

  let guard = steady.length * 100; // Infinite-loop guard — trimming should never need to go beyond this.
  while (average() > AVG_HIGH_S && guard-- > 0) {
    let longest = steady[0] as DraftSegment;
    for (const s of steady) {
      if (s.out - s.in > longest.out - longest.in) longest = s;
    }
    const curLen = longest.out - longest.in;
    if (curLen <= MIN_CUT_S) break; // No more room to trim.
    const newLen = Math.max(MIN_CUT_S, curLen - TRIM_STEP_S);
    const center = (longest.in + longest.out) / 2;
    longest.in = center - newLen / 2;
    longest.out = center + newLen / 2;
  }
}

/**
 * Converts moments.json into cuesheet input according to the assembly rules (quality
 * filter, timelapse-connector insertion, chronological sort). The return value is not
 * yet validated (CueSheetInput) — the caller validates it with validateCueSheet.
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
          // If the padded length exceeds the cap, shrink both ends symmetrically (keep the
          // motion centered) — trimming only one side would just eat back the padding we
          // just added, making it pointless.
          const excess = len - MAX_CUT_S;
          inS += excess / 2;
          outS -= excess / 2;
        }
        steadyCandidates.push({ inS, outS, speed: 1, volume: 1, subtitle: m.memo });
      }
    }
    steadyCandidates.sort((a, b) => a.inS - b.inS);
    // If padding causes adjacent cuts within the same clip to overlap, roll back half the
    // overlap from each side so only the non-overlapping portion of padding remains.
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
