import type { z } from "zod";
import { cueSheetSchema } from "./schema.js";
import type { CueSheet } from "./types.js";

export type ValidationResult =
  | { ok: true; data: CueSheet }
  | { ok: false; errors: string[] };

/**
 * Validates a cuesheet JSON.
 * On success, returns the parsed data (with defaults applied); on failure, returns a
 * list of clear error messages describing which field is wrong and why.
 */
export function validateCueSheet(json: unknown): ValidationResult {
  const result = cueSheetSchema.safeParse(json);
  if (result.success) {
    return { ok: true, data: result.data };
  }
  return { ok: false, errors: result.error.issues.map(formatIssue) };
}

/**
 * Formats a single zod issue as "field.path: message" (e.g. "segments[0].in: in < out").
 * Exported so other packages validating their own zod schemas (e.g. @cuesheet/draft's
 * moments.json) can reuse the same "field path: reason" convention instead of reimplementing it.
 */
export function formatIssue(issue: z.core.$ZodIssue): string {
  return `${pathToString(issue.path)}: ${issue.message}`;
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
