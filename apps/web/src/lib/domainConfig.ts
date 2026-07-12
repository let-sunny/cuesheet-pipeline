import type { BadgeVariant } from "@astryxdesign/core/Badge";

/**
 * The domain's scene-presentation model as the web editor consumes it - fetched once from
 * `GET /api/domain` (the server reads the active domain bundle via `@cuesheet/draft`). Lifting this
 * out of hardcoded web maps (issue #31 item 1) is what lets a different genre render its own scene
 * vocabulary with no web code change; this file is client-safe (types + a neutral fallback + pure
 * helpers only - it never imports the server-side bundle loader).
 */
export interface DomainCategory {
  id: string;
  label: string;
  /** Astryx Badge variant name (e.g. "teal"); unknown values fall back to "neutral" at render. */
  color: string;
}

export interface DomainMemoPattern {
  /** Category id a moment is promoted to when its memo matches `pattern`. */
  category: string;
  /** A RegExp source string (matched case-sensitively against the memo text). */
  pattern: string;
}

export interface DomainConfig {
  /** shotType id -> display label (from the domain's shot-types.json). */
  shotTypeLabels: Record<string, string>;
  /** The category vocabulary (id + label + color), display order preserved. */
  categories: DomainCategory[];
  /** shotType id -> category id. */
  shotTypeCategory: Record<string, string>;
  /** memo-text patterns that override the shot-type category (first match wins). */
  memoPatterns: DomainMemoPattern[];
  /** Category id used for timelapse (monotonous) range cards. */
  rangeCategory: string;
  /** The face-exposure marker the vision reader embeds in memos (from face-policy.json). */
  faceTag: string;
}

/**
 * The fallback when no domain data is available (server error, or a bundle with no categories.json).
 * Deliberately domain-neutral: no genre-specific labels/categories, everything renders as "Other".
 * `faceTag` keeps the tool-wide vision marker so face-tagged moments still surface a badge even in
 * the degraded state. Real runs always get the active domain's config over the wire, so this is a
 * safety net, not the normal path.
 */
export const NEUTRAL_DOMAIN_CONFIG: DomainConfig = {
  shotTypeLabels: {},
  categories: [{ id: "other", label: "Other", color: "neutral" }],
  shotTypeCategory: {},
  memoPatterns: [],
  rangeCategory: "other",
  faceTag: "[얼굴노출]",
};

/** Category id -> its configured label, falling back to "Other" for an id not present in
 * `config.categories` (defensive - shouldn't happen in practice, since every category id in play
 * is itself derived from this same config). */
export function categoryLabel(config: DomainConfig, categoryId: string): string {
  return config.categories.find((c) => c.id === categoryId)?.label ?? "Other";
}

/** Validates a domain-supplied color string against Astryx's known Badge variant names, falling
 * back to "neutral" for anything unrecognized - this is what keeps a 2nd domain naming a color
 * Astryx's Badge doesn't know (e.g. a typo, or a variant that doesn't exist yet) from crashing the
 * component instead of just rendering a slightly-off badge. */
export function badgeVariantFor(color: string): BadgeVariant {
  return (KNOWN_BADGE_VARIANTS as readonly string[]).includes(color) ? (color as BadgeVariant) : "neutral";
}

/** Category id -> Badge variant, via its configured color (`badgeVariantFor`). */
export function categoryBadgeVariant(config: DomainConfig, categoryId: string): BadgeVariant {
  const category = config.categories.find((c) => c.id === categoryId);
  return badgeVariantFor(category?.color ?? "neutral");
}

/** Every variant name Astryx's `Badge` component actually supports (`BadgeVariantMap`'s keys) -
 * kept as a literal list here since `keyof BadgeVariantMap` only exists at the type level. */
const KNOWN_BADGE_VARIANTS: readonly BadgeVariant[] = [
  "neutral",
  "info",
  "success",
  "warning",
  "error",
  "blue",
  "cyan",
  "green",
  "orange",
  "pink",
  "purple",
  "red",
  "teal",
  "yellow",
];
