import type { z } from "zod";

/**
 * Derives a mechanically-computed repair suggestion for a single zod validation issue, when
 * one exists. Returns `undefined` when the fix would require human judgment (shape errors like
 * wrong type/missing key, or a bound where the boundary value itself isn't a legal value - e.g.
 * an exclusive "must be > 0").
 *
 * Zero effect on validation outcomes: this only reads already-failed issues to describe a
 * suggested value, it never changes what parses or fails.
 *
 * Covered rules:
 * - too_small / too_big with a numeric, INCLUSIVE bound (e.g. `speed <= 16`, `volume >= 0`): the
 *   bound itself is a legal value, so the fix is "clamp to <bound>".
 * - project.width/height failing the "must be even" refine: "round to nearest even", computed
 *   from the actual value (relies on `reportInput: true` being passed to `safeParse` so
 *   `issue.input` carries the raw value).
 * - a segment's `in >= out` refine, when `in > out`: "swap to in=<out>, out=<in>" (also relies on
 *   `reportInput: true`, since the whole segment is `issue.input` here). When `in === out`,
 *   swapping wouldn't fix anything and there's no single mechanical value to suggest, so no hint
 *   is given.
 */
export function deriveHint(issue: z.core.$ZodIssue): string | undefined {
  switch (issue.code) {
    case "too_big":
      return deriveTooBigHint(issue);
    case "too_small":
      return deriveTooSmallHint(issue);
    case "custom":
      return deriveCustomHint(issue);
    default:
      return undefined;
  }
}

function deriveTooBigHint(issue: z.core.$ZodIssueTooBig): string | undefined {
  if (issue.inclusive !== true || typeof issue.maximum !== "number") return undefined;
  return `clamp to ${issue.maximum}`;
}

function deriveTooSmallHint(issue: z.core.$ZodIssueTooSmall): string | undefined {
  if (issue.inclusive !== true || typeof issue.minimum !== "number") return undefined;
  return `clamp to ${issue.minimum}`;
}

function deriveCustomHint(issue: z.core.$ZodIssueCustom): string | undefined {
  return deriveEvenDimensionHint(issue) ?? deriveInOutSwapHint(issue);
}

/** project.width/project.height's "must be even for video encoding" refine (see schema.ts). */
function deriveEvenDimensionHint(issue: z.core.$ZodIssueCustom): string | undefined {
  const field = issue.path[issue.path.length - 1];
  if (
    (field !== "width" && field !== "height") ||
    !issue.message.includes("must be even") ||
    typeof issue.input !== "number"
  ) {
    return undefined;
  }
  const value = issue.input;
  return `round to nearest even (${value - 1} or ${value + 1})`;
}

/** segmentSchema's "in must be less than out (in < out)" refine (see schema.ts). */
function deriveInOutSwapHint(issue: z.core.$ZodIssueCustom): string | undefined {
  const field = issue.path[issue.path.length - 1];
  if (field !== "in" || !issue.message.includes("in < out") || !isInOutLike(issue.input)) {
    return undefined;
  }
  const { in: inValue, out } = issue.input;
  // in === out has no single mechanical fix (swapping leaves it unchanged) - leave to a human.
  if (inValue <= out) return undefined;
  return `swap to in=${out}, out=${inValue}`;
}

function isInOutLike(value: unknown): value is { in: number; out: number } {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.in === "number" && typeof record.out === "number";
}
