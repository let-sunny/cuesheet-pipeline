import type { CueSheetInput } from "@cuesheet/schema";
import type { ClipMoments, MonotonousRange } from "./types.js";

/**
 * assemble stage: assembles moments.json (vision judgment results) into a cuesheet
 * using deterministic rules. Pure function — validation (validateCueSheet) is done
 * separately by the caller (CLI).
 */

/**
 * The editing-grammar constants below (cut rhythm, quality threshold, timelapse-connector
 * rules, face heuristic word lists, boundary pad) encode the user's own editing style, reverse
 * engineered from real edited episodes (see docs/STATUS.md). They're grouped into
 * AssembleGrammarConfig so a different user/style can override them without touching this
 * file — defaults below are exactly the previously-hardcoded values, so omitting `config`
 * reproduces prior behavior byte-for-byte.
 */
export interface AssembleGrammarConfig {
  /** Minimum vision-judged quality (moment.quality) to accept as a steady-speed highlight. */
  qualityThreshold: number;
  /** Individual steady-cut length range (seconds) and average-convergence target. */
  cutRhythm: {
    /** Lower bound a cut may be trimmed down to. */
    minCutS: number;
    /** Upper bound a single (padded) cut may reach before symmetric clamping. */
    maxCutS: number;
    /** If the overall steady-cut average exceeds this value, run the convergence pass. */
    avgTriggerS: number;
    /** Convergence target upper bound (lower bound is 2.8 — since the trim step is small, it usually lands within this range). */
    avgHighS: number;
    /** Per-iteration trim amount (seconds) taken off the longest steady cut during convergence. */
    trimStepS: number;
  };
  /** Timelapse (speed-up) connector rules for monotonousRanges. */
  timelapseConnector: {
    /** Playback speed (midpoint of the 12-16 range — compresses a 30-60s slice into 2.1-4.3s of output). */
    speed: number;
    minSliceS: number;
    maxSliceS: number;
    /** Cap on timelapse connectors per episode (to prevent overuse). */
    capPerEpisode: number;
  };
  /**
   * Face-exposure heuristic fallback, used only when a monotonousRange's `faceExposed` is
   * omitted: risky if any partWords entry and riskWord both appear in `desc`.
   */
  faceHeuristic: {
    partWords: string[];
    riskWord: string;
  };
  /**
   * Default padding (seconds) added to steady-highlight cut boundaries when
   * AssembleOptions.boundaryPadS is not given. Prevents a motion (knitting hand gesture) from
   * being cut off before it completes — see the "doesn't respect breathing room" complaint
   * pattern in transcript-based editors and Descript's 'Avoid harsh cuts' reference.
   */
  boundaryPadS: number;
}

export const DEFAULT_ASSEMBLE_CONFIG: AssembleGrammarConfig = {
  qualityThreshold: 3,
  cutRhythm: {
    minCutS: 2,
    maxCutS: 3.5,
    avgTriggerS: 3.1,
    avgHighS: 3.0,
    trimStepS: 0.25,
  },
  timelapseConnector: {
    speed: 14,
    minSliceS: 30,
    maxSliceS: 60,
    capPerEpisode: 8,
  },
  faceHeuristic: {
    partWords: ["얼굴", "입술", "눈~입", "이목구비"],
    riskWord: "노출",
  },
  boundaryPadS: 0.4,
};

/** A deep-partial override of AssembleGrammarConfig — every field (including nested groups) is optional. */
export type AssembleGrammarConfigOverride = {
  [K in keyof AssembleGrammarConfig]?: AssembleGrammarConfig[K] extends object
    ? Partial<AssembleGrammarConfig[K]>
    : AssembleGrammarConfig[K];
};

/**
 * Deep-merges a partial override onto a base config (shallow merge within each group). The base
 * defaults to DEFAULT_ASSEMBLE_CONFIG (the knitting grammar); a domain passes its own grammar as
 * the base, so precedence reads base < `--config` override.
 */
export function resolveAssembleConfig(
  overrides?: AssembleGrammarConfigOverride,
  base: AssembleGrammarConfig = DEFAULT_ASSEMBLE_CONFIG,
): AssembleGrammarConfig {
  if (!overrides) return base;
  return {
    qualityThreshold: overrides.qualityThreshold ?? base.qualityThreshold,
    cutRhythm: { ...base.cutRhythm, ...overrides.cutRhythm },
    timelapseConnector: {
      ...base.timelapseConnector,
      ...overrides.timelapseConnector,
    },
    faceHeuristic: { ...base.faceHeuristic, ...overrides.faceHeuristic },
    boundaryPadS: overrides.boundaryPadS ?? base.boundaryPadS,
  };
}

/** Thumbnail candidate frame surfaced in the assemble report (see findThumbnailCandidates). */
export interface ThumbnailCandidate {
  clip: string;
  inS: number;
  shotType: string;
  memo: string;
}

export interface AssembleOptions {
  clipDir: string;
  projectName: string;
  fps?: number;
  width?: number;
  height?: number;
  /** Steady-highlight cut boundary padding (seconds). Default: config.boundaryPadS (0.4) — pass 0 to assemble without padding. */
  boundaryPadS?: number;
  /** Actual per-clip duration (seconds, durS from manifest.json) — used to clamp boundary padding so it doesn't extend past the clip's end. Clips without an entry skip clamping. */
  clipDurations?: Record<string, number>;
  /** Editing-grammar overrides (cut rhythm/quality/timelapse-connector/face-heuristic/boundary-pad). Omit to use DEFAULT_ASSEMBLE_CONFIG (the user's grammar). */
  config?: AssembleGrammarConfigOverride;
  /** Base grammar the `config` override merges onto. Default DEFAULT_ASSEMBLE_CONFIG; a domain passes its own grammar (resolveDomainAssembleConfig) so precedence is domain < `--config`. */
  configBase?: AssembleGrammarConfig;
  /** Whether the face policy is active (decision C: the engine keeps the face-exclusion mechanism, the domain owns the on/off). Default true; false lets face-exposure-risk ranges still become timelapse connectors. */
  facePolicyEnabled?: boolean;
}

/**
 * Converts moments.json into cuesheet input according to the assembly rules (quality
 * filter, timelapse-connector insertion, chronological sort). The return value is not
 * yet validated (CueSheetInput) — the caller validates it with validateCueSheet.
 */
export function assembleDraft(clipsMoments: ClipMoments[], options: AssembleOptions): CueSheetInput {
  const config = resolveAssembleConfig(options.config, options.configBase);
  const facePolicyEnabled = options.facePolicyEnabled ?? true;
  const sortedClips = [...clipsMoments].sort((a, b) => a.clip.localeCompare(b.clip));
  const padS = options.boundaryPadS ?? config.boundaryPadS;

  const segments: DraftSegment[] = [];
  let speedupCount = 0;
  // Claims the single mid-episode hero-cut allowance (item 2): the first quality-5
  // reveal/cat/wearing moment encountered (in clip/time order) gets to keep up to
  // HERO_MAX_CUT_S instead of the standard cutRhythm.maxCutS, and is exempted from the
  // average-convergence trim pass below. Capped at one so the "at most 3 hero cuts per
  // episode" budget (this one + the opening teaser + the closing reveal, see
  // applyHeroBeats) is never exceeded from this loop alone.
  let heroMidClaimed = false;

  for (const cm of sortedClips) {
    const clipDur = options.clipDurations?.[cm.clip] ?? Number.POSITIVE_INFINITY;

    const steadyCandidates: Candidate[] = [];
    for (const m of cm.moments) {
      if (m.quality >= config.qualityThreshold) {
        const isHeroMid =
          !heroMidClaimed &&
          m.quality === 5 &&
          isHeroShotType(m.shotType) &&
          !isTextRisky(m.memo, undefined, config.faceHeuristic);
        const maxCutS = isHeroMid ? HERO_MAX_CUT_S : config.cutRhythm.maxCutS;

        let inS = Math.max(0, m.inS - padS);
        let outS = Math.min(clipDur, m.outS + padS);
        const len = outS - inS;
        if (len > maxCutS) {
          // If the padded length exceeds the cap, shrink both ends symmetrically (keep the
          // motion centered) — trimming only one side would just eat back the padding we
          // just added, making it pointless.
          const excess = len - maxCutS;
          inS += excess / 2;
          outS -= excess / 2;
        }
        if (isHeroMid) heroMidClaimed = true;
        steadyCandidates.push({ inS, outS, speed: 1, volume: 1, subtitle: m.memo, shotType: m.shotType, isHero: isHeroMid });
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
      if (speedupCount >= config.timelapseConnector.capPerEpisode) break;
      if (facePolicyEnabled && isMonotonousRangeRisky(r, config.faceHeuristic)) {
        console.log(`[assemble] ${cm.clip} ${r.startS}-${r.endS}s: skipping timelapse connector, face-exposure risk`);
        continue;
      }
      const fullDur = r.endS - r.startS;
      if (fullDur < config.timelapseConnector.minSliceS) continue;
      const sliceDur = Math.min(fullDur, config.timelapseConnector.maxSliceS);
      candidates.push({
        inS: r.startS,
        outS: r.startS + sliceDur,
        speed: config.timelapseConnector.speed,
        volume: 1,
        subtitle: `(빨리감기) ${r.desc}`,
      });
      speedupCount++;
    }

    candidates.sort((a, b) => a.inS - b.inS);
    for (const c of candidates) {
      segments.push({
        clip: cm.clip,
        in: c.inS,
        out: c.outS,
        speed: c.speed,
        volume: c.volume,
        subtitle: c.subtitle,
        shotType: c.shotType,
        isHero: c.isHero,
      });
    }
  }

  convergeSteadyCutAverage(segments, config.cutRhythm);
  applyHeroBeats(segments, sortedClips, config);

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
    segments: segments.map(({ clip, in: inS, out, speed, volume, subtitle }) => ({
      clip,
      in: inS,
      out,
      speed,
      volume,
      subtitle,
    })),
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

/**
 * Finds up to `limit` thumbnail candidate frames for the assemble CLI report (item 3): quality-5
 * moments whose shotType reads as thumbnail-worthy (reveal/wearing/cat/object), excluding any
 * that carry face-exposure risk (same faceHeuristic signal used throughout this file — see
 * isTextRisky). Pure/exported so the CLI report and tests share one implementation.
 */
export function findThumbnailCandidates(
  clipsMoments: ClipMoments[],
  faceHeuristic: AssembleGrammarConfig["faceHeuristic"] = DEFAULT_ASSEMBLE_CONFIG.faceHeuristic,
  limit = 5,
): ThumbnailCandidate[] {
  const candidates: ThumbnailCandidate[] = [];
  for (const cm of clipsMoments) {
    for (const m of cm.moments) {
      if (m.quality !== 5) continue;
      if (!THUMBNAIL_SHOT_TYPES.includes(m.shotType)) continue;
      if (isTextRisky(m.memo, undefined, faceHeuristic)) continue;
      candidates.push({ clip: cm.clip, inS: m.inS, shotType: m.shotType, memo: m.memo });
    }
  }
  return candidates.slice(0, limit);
}

/**
 * Whether a face-exposure heuristic text (a monotonousRange's desc, or a moment's memo) carries
 * risk. If an explicit flag is given, follow it as-is; otherwise fall back to a desc/memo-text
 * heuristic (risky if a face-part word and the risk word both appear — conservatively, treat
 * ambiguous cases as risky. Observed in practice: vision judgments sometimes phrase this using
 * only a part name without the word "face" itself, e.g. "lips are almost always exposed", so
 * part-name vocabulary is checked too).
 */
function isTextRisky(
  text: string,
  explicit: boolean | undefined,
  faceHeuristic: AssembleGrammarConfig["faceHeuristic"],
): boolean {
  if (typeof explicit === "boolean") return explicit;
  const facePart = faceHeuristic.partWords.some((w) => text.includes(w));
  return facePart && text.includes(faceHeuristic.riskWord);
}

/** Whether a timelapse-connector candidate range carries face-exposure risk — see isTextRisky. */
function isMonotonousRangeRisky(
  r: MonotonousRange,
  faceHeuristic: AssembleGrammarConfig["faceHeuristic"],
): boolean {
  return isTextRisky(r.desc, r.faceExposed, faceHeuristic);
}

function isHeroShotType(shotType: string): boolean {
  return (HERO_SHOT_TYPES as readonly string[]).includes(shotType);
}

/**
 * Item 1 (guaranteed opening/closing): picks the episode's single best reveal/cat/wearing
 * moment (highest quality, quality-5 preferred, excluding face-exposure risk) and duplicates it
 * as a short teaser at the very start of the timeline — an inserted duplicate, never a reorder
 * (this project's matching is order-preserving/monotonic per CLAUDE.md, so the original
 * occurrence stays exactly where it was). If the episode's natural last segment doesn't already
 * read as a reveal, a strong-reveal candidate is duplicated onto the end too (preferring an
 * actual shotType "reveal" candidate over the cat/wearing fallback used for the teaser). Mutates
 * `segments` in place; no-ops gracefully when no qualifying candidate exists anywhere.
 */
function applyHeroBeats(
  segments: DraftSegment[],
  clipsMoments: ClipMoments[],
  config: AssembleGrammarConfig,
): void {
  const pool = collectHeroCandidates(clipsMoments, config.qualityThreshold, config.faceHeuristic);
  if (pool.length === 0) return;

  const teaserSource = pickBestHeroCandidate(pool);
  if (!teaserSource) return;
  segments.unshift(buildHeroSegment(teaserSource, TEASER_MAX_CUT_S));

  const lastSegment = segments[segments.length - 1];
  const lastIsReveal = lastSegment?.shotType === "reveal";
  if (!lastIsReveal) {
    // Closing wants an actual shotType "reveal" (a "strong reveal") — unlike the teaser, which
    // accepts cat/wearing as a fallback, there's no lesser-quality substitute here: if the
    // episode has no reveal-type moment at all, skip the closing duplicate gracefully.
    const closingSource = pickBestHeroCandidate(pool.filter((c) => c.shotType === "reveal"));
    if (closingSource) segments.push(buildHeroSegment(closingSource, HERO_MAX_CUT_S));
  }
}

/** Collects reveal/cat/wearing moments eligible as a hero (teaser/closing) candidate. */
function collectHeroCandidates(
  clipsMoments: ClipMoments[],
  qualityThreshold: number,
  faceHeuristic: AssembleGrammarConfig["faceHeuristic"],
): HeroCandidate[] {
  const candidates: HeroCandidate[] = [];
  for (const cm of clipsMoments) {
    for (const m of cm.moments) {
      if (!isHeroShotType(m.shotType)) continue;
      if (m.quality < qualityThreshold) continue;
      if (isTextRisky(m.memo, undefined, faceHeuristic)) continue;
      candidates.push({ clip: cm.clip, inS: m.inS, outS: m.outS, quality: m.quality, shotType: m.shotType, memo: m.memo });
    }
  }
  return candidates;
}

/** Highest-quality candidate in the pool (quality 5 preferred; first-encountered wins ties). */
function pickBestHeroCandidate(pool: HeroCandidate[]): HeroCandidate | undefined {
  let best: HeroCandidate | undefined;
  for (const c of pool) {
    if (!best || c.quality > best.quality) best = c;
  }
  return best;
}

/** Builds a hero (teaser/closing) duplicate segment, clamped symmetrically to maxLenS. */
function buildHeroSegment(c: HeroCandidate, maxLenS: number): DraftSegment {
  let inS = c.inS;
  let outS = c.outS;
  const len = outS - inS;
  if (len > maxLenS) {
    const excess = len - maxLenS;
    inS += excess / 2;
    outS -= excess / 2;
  }
  return { clip: c.clip, in: Math.max(0, inS), out: outS, speed: 1, volume: 1, subtitle: c.memo, shotType: c.shotType, isHero: true };
}

interface Candidate {
  inS: number;
  outS: number;
  speed: number;
  volume: number;
  subtitle: string;
  /** Vision-judged shotType (steady candidates only — a timelapse connector has none). */
  shotType?: string;
  /** Claims the single mid-episode hero-cut allowance (item 2) — see assembleDraft's heroMidClaimed. */
  isHero?: boolean;
}

/** A reveal/cat/wearing moment under consideration as a hero (teaser/closing) duplicate. */
interface HeroCandidate {
  clip: string;
  inS: number;
  outS: number;
  quality: number;
  shotType: string;
  memo: string;
}

type DraftSegment = {
  clip: string;
  in: number;
  out: number;
  speed: number;
  volume: number;
  subtitle: string;
  shotType?: string;
  isHero?: boolean;
};

/**
 * If the overall average length of steady cuts (speed===1) exceeds AVG_TRIGGER_S (3.1s),
 * a simple greedy pass trims the longest cut by 0.25s at a time until the average converges
 * into the 2.8-3.0s range. Timelapse connectors (speed!==1) are left untouched, and so is the
 * mid-episode hero cut (isHero — item 2's single ~5s allowance; it must stay fixed, not get
 * ground back down to the standard target by this very pass). Mutates the segment objects
 * directly. Trimming shrinks symmetrically from both the in/out ends — so the motion-centered
 * framing gained from boundary padding isn't rendered meaningless by trimming from only one side.
 */
function convergeSteadyCutAverage(
  segments: DraftSegment[],
  cutRhythm: AssembleGrammarConfig["cutRhythm"],
): void {
  const steady = segments.filter((s) => s.speed === 1 && !s.isHero);
  if (steady.length === 0) return;

  const average = () => steady.reduce((sum, s) => sum + (s.out - s.in), 0) / steady.length;

  if (average() <= cutRhythm.avgTriggerS) return;

  let guard = steady.length * 100; // Infinite-loop guard — trimming should never need to go beyond this.
  while (average() > cutRhythm.avgHighS && guard-- > 0) {
    let longest = steady[0] as DraftSegment;
    for (const s of steady) {
      if (s.out - s.in > longest.out - longest.in) longest = s;
    }
    const curLen = longest.out - longest.in;
    if (curLen <= cutRhythm.minCutS) break; // No more room to trim.
    const newLen = Math.max(cutRhythm.minCutS, curLen - cutRhythm.trimStepS);
    const center = (longest.in + longest.out) / 2;
    longest.in = center - newLen / 2;
    longest.out = center + newLen / 2;
  }
}

/** shotTypes treated as a hero (teaser/closing) candidate for the guaranteed opening/closing rule. */
const HERO_SHOT_TYPES = ["reveal", "cat", "wearing"] as const;
/** Duration cap (seconds) for a hero cut (closing reveal duplicate, or the mid-episode allowance) — item 2. */
const HERO_MAX_CUT_S = 5;
/** Duration cap (seconds) for the opening teaser duplicate — short per item 1, well under HERO_MAX_CUT_S. */
const TEASER_MAX_CUT_S = 3;
/** shotTypes eligible as a thumbnail candidate (item 3's CLI report). */
const THUMBNAIL_SHOT_TYPES = ["reveal", "wearing", "cat", "object"];

const DEFAULT_FPS = 30;
const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 720;
