import { DEFAULT_ASSEMBLE_CONFIG, isTextRisky } from "./assemble.js";
import type { AssembleGrammarConfig } from "./assemble.js";
import type { ClipMoments, Moment } from "./types.js";

/**
 * shorts stage: derives vertical Shorts from the SAME moments.json the rough cut is assembled
 * from - a by-product of footage already judged for the long-form episode, never a separate
 * shoot or a second vision pass. Each Short is "a few process cuts -> one hero moment" (the
 * episode's strongest reveal / cat / wearing beat), kept in footage order.
 *
 * Two pure halves, both unit-tested without ffmpeg:
 * - planShorts: picks the hero moments and their lead-in cuts.
 * - buildShortFfmpegArgs: turns one plan into an ffmpeg invocation that center-crops every cut
 *   to a vertical frame (landscape sources lose their sides, portrait sources pass through).
 */

export interface ShortsConfig {
  /** shotTypes that can carry a Short on their own, in priority order. */
  heroShotTypes: string[];
  /** shotTypes usable as the process cuts leading up to the hero. */
  leadInShotTypes: string[];
  /** Minimum quality for a lead-in cut, and for a hero when no quality-5 hero exists. */
  minQuality: number;
  /** Process cuts placed before the hero (fewer are used when not enough precede it). */
  leadInCount: number;
  /** Length cap (seconds) of each lead-in cut. */
  leadInMaxS: number;
  /** Length cap (seconds) of the hero cut. */
  heroMaxS: number;
  /** Maximum number of Shorts planned per episode. */
  maxShorts: number;
  faceHeuristic: AssembleGrammarConfig["faceHeuristic"];
}

export interface ShortCut {
  clip: string;
  inS: number;
  outS: number;
  shotType: string;
  memo: string;
  role: "lead-in" | "hero";
}

export interface ShortPlan {
  /** 1-based, zero-padded ("01") - used for the output filename. */
  id: string;
  /** The hero moment's memo: what this Short is about, a starting point for its title. */
  hook: string;
  durationS: number;
  cuts: ShortCut[];
}

export interface ShortRenderOptions {
  width?: number;
  height?: number;
  fps?: number;
}

/** One cut as handed to buildShortFfmpegArgs: an absolute path plus whether it has an audio stream. */
export interface ShortRenderCut {
  path: string;
  inS: number;
  outS: number;
  hasAudio: boolean;
}

export const DEFAULT_SHORTS_CONFIG: ShortsConfig = {
  heroShotTypes: ["reveal", "wearing", "cat"],
  leadInShotTypes: ["hand-closeup", "change", "object"],
  minQuality: 4,
  leadInCount: 3,
  leadInMaxS: 2.5,
  heroMaxS: 5,
  maxShorts: 3,
  faceHeuristic: DEFAULT_ASSEMBLE_CONFIG.faceHeuristic,
};

/**
 * Plans up to `maxShorts` Shorts. Heroes are picked round-robin across `heroShotTypes` (so an
 * episode with both a reveal and a cat beat yields one Short of each before a second reveal),
 * best quality first within a type, last occurrence first on ties (the final reveal is the
 * finished object). Any moment carrying face-exposure risk is excluded outright - unlike the
 * long-form cut there is no crop rescue here, since the vertical crop only trims the sides.
 */
export function planShorts(clipsMoments: ClipMoments[], overrides: Partial<ShortsConfig> = {}): ShortPlan[] {
  const config: ShortsConfig = { ...DEFAULT_SHORTS_CONFIG, ...overrides };
  const timeline = flattenInFootageOrder(clipsMoments).filter(
    (e) => e.moment.outS > e.moment.inS && !isTextRisky(e.moment.memo, undefined, config.faceHeuristic),
  );

  const heroes = pickHeroes(timeline, config);
  return heroes.map((hero, i) => {
    const leadIns = timeline
      .filter(
        (e) =>
          e.index < hero.index &&
          e.moment.quality >= config.minQuality &&
          config.leadInShotTypes.includes(e.moment.shotType),
      )
      .slice(-config.leadInCount)
      .map((e) => toCut(e, "lead-in", config.leadInMaxS));
    const cuts = [...leadIns, toCut(hero, "hero", config.heroMaxS)];
    return {
      id: String(i + 1).padStart(2, "0"),
      hook: hero.moment.memo,
      durationS: round2(cuts.reduce((sum, c) => sum + (c.outS - c.inS), 0)),
      cuts,
    };
  });
}

/**
 * Builds the ffmpeg args that render one Short: every cut is seek-trimmed (`-ss` before `-i`),
 * scaled to cover the vertical frame and center-cropped to it, then concatenated. A cut with
 * no audio stream gets generated silence so the concat's audio track stays continuous.
 */
export function buildShortFfmpegArgs(
  cuts: ShortRenderCut[],
  outPath: string,
  options: ShortRenderOptions = {},
): string[] {
  if (cuts.length === 0) throw new Error("buildShortFfmpegArgs: a Short needs at least one cut");
  const width = options.width ?? DEFAULT_WIDTH;
  const height = options.height ?? DEFAULT_HEIGHT;
  const fps = options.fps ?? DEFAULT_FPS;

  const inputs: string[] = [];
  const filters: string[] = [];
  const concatPads: string[] = [];
  cuts.forEach((cut, i) => {
    const durS = round2(cut.outS - cut.inS);
    inputs.push("-ss", String(cut.inS), "-t", String(durS), "-i", cut.path);
    filters.push(
      `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,fps=${fps},format=yuv420p[v${i}]`,
    );
    filters.push(
      cut.hasAudio
        ? `[${i}:a]aresample=${AUDIO_RATE},aformat=channel_layouts=stereo[a${i}]`
        : `anullsrc=r=${AUDIO_RATE}:cl=stereo,atrim=duration=${durS}[a${i}]`,
    );
    concatPads.push(`[v${i}][a${i}]`);
  });
  filters.push(`${concatPads.join("")}concat=n=${cuts.length}:v=1:a=1[v][a]`);

  return [
    "-y",
    ...inputs,
    "-filter_complex",
    filters.join(";"),
    "-map",
    "[v]",
    "-map",
    "[a]",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
    outPath,
  ];
}

interface TimelineEntry {
  index: number;
  clip: string;
  moment: Moment;
}

/** Same order assemble uses: clips by filename, moments by ascending `inS` within a clip. */
function flattenInFootageOrder(clipsMoments: ClipMoments[]): TimelineEntry[] {
  const sortedClips = [...clipsMoments].sort((a, b) => a.clip.localeCompare(b.clip));
  const entries: TimelineEntry[] = [];
  for (const cm of sortedClips) {
    for (const moment of [...cm.moments].sort((a, b) => a.inS - b.inS)) {
      entries.push({ index: entries.length, clip: cm.clip, moment });
    }
  }
  return entries;
}

function pickHeroes(timeline: TimelineEntry[], config: ShortsConfig): TimelineEntry[] {
  const eligible = timeline.filter(
    (e) => config.heroShotTypes.includes(e.moment.shotType) && e.moment.quality >= config.minQuality,
  );
  const top = eligible.filter((e) => e.moment.quality >= TOP_QUALITY);
  const pool = top.length > 0 ? top : eligible;

  const byType = config.heroShotTypes.map((shotType) =>
    pool
      .filter((e) => e.moment.shotType === shotType)
      .sort((a, b) => b.moment.quality - a.moment.quality || b.index - a.index),
  );
  const heroes: TimelineEntry[] = [];
  for (let round = 0; heroes.length < config.maxShorts; round++) {
    const picked = byType.map((queue) => queue[round]).filter((e): e is TimelineEntry => e !== undefined);
    if (picked.length === 0) break;
    heroes.push(...picked.slice(0, config.maxShorts - heroes.length));
  }
  return heroes;
}

/** Lead-ins keep the middle of the moment (the settled part of the motion); the hero keeps its start. */
function toCut(entry: TimelineEntry, role: ShortCut["role"], maxS: number): ShortCut {
  const { inS, outS, shotType, memo } = entry.moment;
  const durS = Math.min(maxS, outS - inS);
  const start = role === "hero" ? inS : inS + (outS - inS - durS) / 2;
  return { clip: entry.clip, inS: round2(start), outS: round2(start + durS), shotType, memo, role };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const TOP_QUALITY = 5;
const DEFAULT_WIDTH = 1080;
const DEFAULT_HEIGHT = 1920;
const DEFAULT_FPS = 30;
const AUDIO_RATE = 48000;
