import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { findLostFieldPaths, validateCueSheet } from "@cuesheet/schema";
import type { ValidationResult } from "@cuesheet/schema";

/**
 * Validates and returns the current cuesheet.
 * If the file is missing or malformed, returns ok:false with a reason.
 */
export function getCuesheet(path: string): ValidationResult {
  let raw: unknown;
  try {
    raw = readRaw(path);
  } catch (e) {
    return { ok: false, errors: [`Could not read the cuesheet file: ${String(e)}`] };
  }
  if (raw === null) {
    return { ok: false, errors: [`Cuesheet file not found: ${path}`] };
  }
  return validateCueSheet(raw);
}

/**
 * Replaces the entire cuesheet with a new value.
 * Only saves if schema validation passes (recorded in canonical form with
 * defaults applied). This function is the core of the "freedom" this bridge
 * provides: whatever edit Claude Code wants to make, it computes the whole
 * new cuesheet and passes it here, where it's validated and safely applied.
 */
export function updateCuesheet(path: string, next: unknown): ValidationResult {
  const result = validateCueSheet(next);
  if (!result.ok) {
    return result;
  }

  // Same risk as web's /api/cuesheet: a zod object silently strips undefined
  // keys. If the server has an older schema loaded, a new field (e.g. crop)
  // could be silently lost on save — before saving, compare the key sets of
  // the original (next) and the serialized result (result.data), and refuse
  // to save if any paths have disappeared.
  const lostPaths = findLostFieldPaths(next, result.data);
  if (lostPaths.length > 0) {
    return {
      ok: false,
      errors: [`Field loss detected on save: ${lostPaths.join(", ")} - restart the server (schema refresh) and retry`],
    };
  }

  writeFileSync(path, `${JSON.stringify(result.data, null, 2)}\n`, "utf-8");
  return result;
}

/** Reads the cuesheet file as-is (before validation). Returns null if missing. */
export function readRaw(path: string): unknown {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8"));
}
