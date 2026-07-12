import type { Segment } from "@cuesheet/schema";
import type { BadgeVariant } from "@astryxdesign/core/Badge";
import type { ClipMoments, ShotType } from "../api.js";
import { baseName, stem } from "../clipPaths.js";
import { categoryBadgeVariant } from "./domainConfig.js";
import type { DomainConfig } from "./domainConfig.js";

/** Category ids are open/domain-driven now (issue #31 item 1) - which ids exist, their labels,
 * and their badge colors all come from the fetched DomainConfig (`config.categories`), not a
 * hardcoded union anymore. */
export type Category = string;

export interface MomentCard {
  key: string;
  clipFileName: string;
  clipFolder: string;
  inS: number;
  outS: number;
  category: Category;
  memo: string;
  /** Only set for moments entries (monotonousRanges has no notion of a quality score). */
  quality: number | null;
}

export type StatusFilter = "all" | "in-use" | "excluded";

/**
 * Flattens each clip's `moments` entries and `monotonousRanges` into one flat, sorted list of
 * palette cards. A monotonousRange becomes a single representative 3s-wide card centered on its
 * own midpoint (clamped inside the range) rather than the whole (often much longer) range, since
 * the palette card is meant to preview a single addable cut, not the whole timelapse-connector
 * source material.
 */
export function buildCards(entries: ClipMoments[], config: DomainConfig): MomentCard[] {
  const list: MomentCard[] = [];
  for (const entry of entries) {
    const clipFileName = baseName(entry.clip);
    const clipFolder = stem(clipFileName);
    for (const m of entry.moments) {
      list.push({
        key: `${clipFileName}::m::${m.inS}::${m.outS}`,
        clipFileName,
        clipFolder,
        inS: m.inS,
        outS: m.outS,
        category: categoryFor(m.shotType, m.memo, config),
        memo: m.memo,
        quality: m.quality,
      });
    }
    for (const r of entry.monotonousRanges) {
      const center = (r.startS + r.endS) / 2;
      const inS = Math.max(r.startS, center - 1.5);
      const outS = Math.min(r.endS, center + 1.5);
      list.push({
        key: `${clipFileName}::range::${r.startS}::${r.endS}`,
        clipFileName,
        clipFolder,
        inS,
        outS,
        category: config.rangeCategory,
        memo: r.desc,
        quality: null,
      });
    }
  }
  list.sort((a, b) => {
    if (a.clipFileName !== b.clipFileName) {
      return a.clipFileName < b.clipFileName ? -1 : 1;
    }
    return a.inS - b.inS;
  });
  return list;
}

/** Card count per category, for the filter row's "(N)" counts. */
export function computeCategoryCounts(cards: MomentCard[]): Map<Category, number> {
  const m = new Map<Category, number>();
  for (const c of cards) {
    m.set(c.category, (m.get(c.category) ?? 0) + 1);
  }
  return m;
}

/**
 * Whether a card is "in use", and if so, which cut number (timeline segment order, 1-based) it
 * was added as - lets the same cut be tracked with the same number between the Compose and Edit
 * steps. "In use" means some added segment overlaps the card's own (clip, in, out) range.
 */
export function computeInUseCutNumbers(cards: MomentCard[], segments: Segment[]): Map<string, number> {
  // Timeline cuts are sequential and non-overlapping, so each cut's number (its 1-based timeline
  // order) must map to exactly ONE scene card - the card that cut was made from. Iterate the cuts
  // (not the cards) and give each cut's number to its single best-overlapping, not-yet-claimed card
  // on the same clip. The old card-driven "any card overlapping any segment gets that segment's
  // number" duplicated numbers (several fine-grained candidates overlap one long cut) and over-
  // counted "in use", contradicting the one-cut-one-number model (2026-07-12 fix).
  const map = new Map<string, number>();
  const claimed = new Set<string>();
  segments.forEach((s, idx) => {
    let best: MomentCard | undefined;
    let bestOverlap = 0;
    for (const c of cards) {
      if (claimed.has(c.key) || c.clipFileName !== s.clip) {
        continue;
      }
      const overlap = Math.min(s.out, c.outS) - Math.max(s.in, c.inS);
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        best = c;
      }
    }
    if (best) {
      map.set(best.key, idx + 1);
      claimed.add(best.key);
    }
  });
  return map;
}

/**
 * Applies both the category filter (or "all") and the status filter ("all" / "in-use" /
 * "excluded") in one pass. "excluded" means auto-assembly didn't adopt the card (not in use) and
 * it was filtered out for a reason auto-assembly actually enforces: face exposure, or a quality
 * score under the assembly's threshold (3) - a card can also be simply not-yet-added without
 * being "excluded" in this sense (e.g. quality null, no face tag).
 */
export function filterCards(
  cards: MomentCard[],
  selectedCategory: Category | "all",
  statusFilter: StatusFilter,
  inUseCutNumber: Map<string, number>,
  config: DomainConfig,
): MomentCard[] {
  const byCategory = selectedCategory === "all" ? cards : cards.filter((c) => c.category === selectedCategory);
  return filterByStatus(byCategory, statusFilter, inUseCutNumber, config);
}

/** The status-axis filter alone (no category). Extracted so the category chip counts can be
 * computed over the status-filtered set - otherwise a chip like "Wearing (4)" promises 4 while an
 * active "Excluded only" filter shows 0 (no wearing card is excluded), which reads as broken. */
export function filterByStatus(
  cards: MomentCard[],
  statusFilter: StatusFilter,
  inUseCutNumber: Map<string, number>,
  config: DomainConfig,
): MomentCard[] {
  return cards.filter((c) => {
    if (statusFilter === "all") {
      return true;
    }
    const inUse = inUseCutNumber.has(c.key);
    if (statusFilter === "in-use") {
      return inUse;
    }
    if (inUse) {
      return false;
    }
    return hasFaceTag(c.memo, config) || (c.quality !== null && c.quality < 3);
  });
}

/** Picks the tNNNNN.jpg frame filename closest to inS. */
export function nearestFrame(frames: string[], inS: number): string | null {
  let best: string | null = null;
  let bestDiff = Infinity;
  for (const f of frames) {
    const m = /^t(\d+)\.jpg$/.exec(f);
    const secStr = m?.[1];
    if (!secStr) {
      continue;
    }
    const diff = Math.abs(parseInt(secStr, 10) - inS);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = f;
    }
  }
  return best;
}

export function hasFaceTag(memo: string, config: DomainConfig): boolean {
  return memo.includes(config.faceTag);
}

export function stripFaceTag(memo: string, config: DomainConfig): string {
  return memo.replace(config.faceTag, "").trim();
}

/**
 * Shot type -> the same Badge variant its category already uses in the Scenes palette
 * (`categoryBadgeVariant`) - reused so the Edit step's per-cut scene badge (CompactSegmentList,
 * VideoPreview) never invents a second color mapping for the same shot types (CLAUDE.md
 * "component layering": dedup, don't restyle). "Timelapse cut" (a monotonous speed-range, not a
 * shotType) isn't covered by this - it uses `config.rangeCategory`'s own badge variant directly
 * (`categoryBadgeVariant(config, config.rangeCategory)`), since a speed-up connector is
 * conceptually the same "monotonous range" category.
 */
export function shotTypeBadgeVariant(shotType: ShotType, config: DomainConfig): BadgeVariant {
  const categoryId = config.shotTypeCategory[shotType] ?? "other";
  return categoryBadgeVariant(config, categoryId);
}

/** memo-pattern override, applied BEFORE the shotType->category fallback (first pattern match
 * wins) - e.g. a "mistake" memo pattern promotes a hand-closeup shot out of "knitting" into
 * "mistake", same for "outing". Falls back to the shotType's configured category, and "other" if
 * even that's unmapped (an open-string shotType the active domain doesn't know about). */
function categoryFor(shotType: ShotType, memo: string, config: DomainConfig): Category {
  for (const p of config.memoPatterns) {
    if (new RegExp(p.pattern).test(memo)) {
      return p.category;
    }
  }
  return config.shotTypeCategory[shotType] ?? "other";
}

/* On-screen copy (PRD section 4 glossary, "[All / In use only / Excluded only]"). */
export const STATUS_FILTER_LABEL: Record<StatusFilter, string> = {
  "all": "All",
  "in-use": "In use only",
  "excluded": "Excluded only",
};
