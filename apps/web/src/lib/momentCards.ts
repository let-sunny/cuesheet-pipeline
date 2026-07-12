import type { Segment } from "@cuesheet/schema";
import type { BadgeVariant } from "@astryxdesign/core/Badge";
import type { ClipMoments, ShotType } from "../api.js";
import { baseName, stem } from "../clipPaths.js";

export type Category =
  | "knit-range"
  | "knitting"
  | "cat"
  | "reveal"
  | "materials"
  | "outing"
  | "mistake"
  | "wearing"
  | "change"
  | "other";

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
export function buildCards(entries: ClipMoments[]): MomentCard[] {
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
        category: categoryFor(m.shotType, m.memo),
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
        category: "knit-range",
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
): MomentCard[] {
  const byCategory = selectedCategory === "all" ? cards : cards.filter((c) => c.category === selectedCategory);
  return filterByStatus(byCategory, statusFilter, inUseCutNumber);
}

/** The status-axis filter alone (no category). Extracted so the category chip counts can be
 * computed over the status-filtered set - otherwise a chip like "Wearing (4)" promises 4 while an
 * active "Excluded only" filter shows 0 (no wearing card is excluded), which reads as broken. */
export function filterByStatus(
  cards: MomentCard[],
  statusFilter: StatusFilter,
  inUseCutNumber: Map<string, number>,
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
    return hasFaceTag(c.memo) || (c.quality !== null && c.quality < 3);
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

export function hasFaceTag(memo: string): boolean {
  return memo.includes(FACE_TAG);
}

export function stripFaceTag(memo: string): string {
  return memo.replace(FACE_TAG, "").trim();
}

function categoryFor(shotType: ShotType, memo: string): Category {
  if (MISTAKE_PATTERN.test(memo)) {
    return "mistake";
  }
  if (OUTING_PATTERN.test(memo)) {
    return "outing";
  }
  return SHOT_TYPE_CATEGORY[shotType] ?? "other";
}

/** The face-exposure risk tag the vision reader leaves in memo/desc. Replaced with a badge in
 * the display and the raw text is stripped out (so it doesn't leak into subtitles either).
 * This tag is not translated because it's a string literally embedded in the generated
 * (Korean) data — it's a content-matching marker, not a UI label. */
export const FACE_TAG = "[얼굴노출]";

/** Category -> Badge variant. Mapped to preserve the original styles.css category-tag color
 * intent as-is (knit-range=teal, knitting=blue, cat=purple, materials=green, mistake=red,
 * wearing=pink, change=cyan, other=gray are 1:1 with the old custom tags). reveal/outing used
 * to have their own custom category-tag colors (the tag-reveal and tag-outing variables,
 * respectively), but the Badge palette doesn't have those two colors, so they were folded into
 * the leftover orange/yellow. */
export const CATEGORY_META: Record<Category, { label: string; badgeVariant: BadgeVariant }> = {
  "knit-range": { label: "Knit range", badgeVariant: "teal" },
  "knitting": { label: "Knitting", badgeVariant: "blue" },
  "cat": { label: "Cat", badgeVariant: "purple" },
  "reveal": { label: "Reveal", badgeVariant: "orange" },
  "materials": { label: "Materials/props", badgeVariant: "green" },
  "outing": { label: "Outing", badgeVariant: "yellow" },
  "mistake": { label: "Mistake", badgeVariant: "red" },
  "wearing": { label: "Wearing", badgeVariant: "pink" },
  "change": { label: "Change", badgeVariant: "cyan" },
  // BadgeVariantMap has no gray (only neutral/info/success/warning/error/blue/cyan/
  // green/orange/pink/purple/red/teal/yellow exist), so substitute the closest one, neutral.
  "other": { label: "Other", badgeVariant: "neutral" },
};

/* On-screen copy (PRD section 4 glossary, "[All / In use only / Excluded only]"). */
export const STATUS_FILTER_LABEL: Record<StatusFilter, string> = {
  "all": "All",
  "in-use": "In use only",
  "excluded": "Excluded only",
};

export const CATEGORY_ORDER: Category[] = [
  "knit-range",
  "knitting",
  "cat",
  "reveal",
  "materials",
  "outing",
  "mistake",
  "wearing",
  "change",
  "other",
];

const SHOT_TYPE_CATEGORY: Record<ShotType, Category> = {
  "hand-closeup": "knitting",
  object: "materials",
  cat: "cat",
  change: "change",
  reveal: "reveal",
  wearing: "wearing",
  other: "other",
};

/**
 * Shot type -> the same Badge variant its category already uses in the Scenes palette
 * (`CATEGORY_META`) - reused so the Edit step's per-cut scene badge (CompactSegmentList,
 * VideoPreview) never invents a second color mapping for the same shot types (CLAUDE.md
 * "component layering": dedup, don't restyle). "Timelapse cut" (a monotonous speed-range, not a
 * shotType) isn't in this map - it uses the "knit-range" category's own teal directly
 * (`TIMELAPSE_BADGE_VARIANT`), since a speed-up connector is conceptually the same "monotonous
 * knitting range" category.
 */
export function shotTypeBadgeVariant(shotType: ShotType): BadgeVariant {
  return CATEGORY_META[SHOT_TYPE_CATEGORY[shotType] ?? "other"].badgeVariant;
}

export const TIMELAPSE_BADGE_VARIANT: BadgeVariant = CATEGORY_META["knit-range"].badgeVariant;

const MISTAKE_PATTERN = /풀|실수|다시\s*뜨/;
const OUTING_PATTERN = /가게|야외|밖에|거리|걷|매장/;
