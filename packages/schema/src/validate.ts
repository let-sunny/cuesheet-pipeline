import type { z } from "zod";
import { deriveHint } from "./hints.js";
import { cueSheetSchema } from "./schema.js";
import type { CueSheet } from "./types.js";

export type ValidationResult =
  | { ok: true; data: CueSheet }
  | { ok: false; errors: string[] };

/**
 * Validates a cuesheet JSON.
 * On success, returns the parsed data (with defaults applied); on failure, returns a
 * list of clear error messages describing which field is wrong and why (each optionally
 * carrying a mechanically-computed repair suggestion as a " — hint" suffix - see hints.ts).
 */
export function validateCueSheet(json: unknown): ValidationResult {
  // reportInput lets deriveHint see the actual invalid value (issue.input) for the hint rules
  // that need it (in/out swap, even-dimension rounding) - see hints.ts. It has no effect on
  // what passes or fails.
  const result = cueSheetSchema.safeParse(json, { reportInput: true });
  if (result.success) {
    return { ok: true, data: result.data };
  }
  return { ok: false, errors: result.error.issues.map(formatIssue) };
}

/**
 * Formats a single zod issue as "field.path: message" (e.g. "segments[0].in: in < out"),
 * with a mechanically-computed repair suggestion appended as " — hint" when one is derivable
 * (see hints.ts) - the "field.path: message" portion never changes, so callers matching on it
 * (prefix/substring) are unaffected; only callers asserting the full string exactly need to
 * account for the optional suffix.
 * Exported so other packages validating their own zod schemas (e.g. @cuesheet/draft's
 * moments.json) can reuse the same "field path: reason" convention instead of reimplementing it.
 */
export function formatIssue(issue: z.core.$ZodIssue): string {
  const base = `${pathToString(issue.path)}: ${issue.message}`;
  const hint = deriveHint(issue);
  return hint ? `${base} — ${hint}` : base;
}

/** Converts a zod issue path (e.g. ["segments", 0, "in"]) into "segments[0].in" form */
function pathToString(path: ReadonlyArray<PropertyKey>): string {
  let out = "";
  for (const key of path) {
    if (typeof key === "number") {
      out += `[${key}]`;
    } else {
      out += out ? `.${String(key)}` : String(key);
    }
  }
  return out || "(root)";
}
