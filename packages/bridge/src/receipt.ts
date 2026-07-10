import type { CueSheet } from "@cuesheet/schema";

/**
 * Structured summary of a cuesheet's current state, returned alongside `update_cuesheet`'s
 * success response so a caller can confirm "did my edit land as intended" without a follow-up
 * `get_cuesheet` call — mirrors the `--json` receipts the `cuesheet-draft`/`cuesheet-render` CLIs
 * already return (see AGENTS.md's CLI surface section). Always built from the cuesheet that was
 * just validated and written (ground truth), never from the caller's input, so a caller can't be
 * fooled by its own mistaken payload. Aggregate facts about the new state only — a field-by-field
 * diff against the previous state is a separate concern (issue #10), not this one.
 */
export interface EditReceipt {
  segmentCount: number;
  /**
   * Total OUTPUT (post-speed) duration in seconds: sum of (out-in)/speed across segments.
   * Same v1 limitation as `@cuesheet/render`'s timeline math: intro/outro duration isn't probed
   * here, so it's excluded.
   *
   * Duplicated here (not imported from `@cuesheet/render`) on purpose: `packages/bridge` only
   * depends on `@cuesheet/schema` per CLAUDE.md's dependency-direction rule (schema is the only
   * package every other package may import; importing `render` into `bridge` would add a cycle-
   * free but rule-violating edge just to reuse one aggregate sum). `@cuesheet/draft`'s
   * `buildAssembleJsonResult` (packages/draft/src/cli.ts) already duplicates the exact same
   * one-line formula for the same reason, so this follows existing precedent rather than
   * inventing a new one.
   */
  durationS: number;
  warnings: string[];
}

/** Builds the receipt from an already-validated cuesheet. Pure — no I/O. */
export function buildEditReceipt(cue: CueSheet): EditReceipt {
  return {
    segmentCount: cue.segments.length,
    durationS: cue.segments.reduce((sum, s) => sum + (s.out - s.in) / s.speed, 0),
    warnings: buildWarnings(cue),
  };
}

function buildWarnings(cue: CueSheet): string[] {
  const warnings: string[] = [];
  if (cue.segments.length === 0) {
    warnings.push("segments is empty — the cuesheet has no content");
  }
  return warnings;
}
