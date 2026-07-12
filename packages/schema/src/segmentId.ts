import type { CueSheet } from "./types.js";

/**
 * Generates a stable, unique segment id (a UUID). Uses the Web Crypto global, available in both
 * Node 20+ and browsers, so this stays usable from the browser bundle (@cuesheet/schema must not
 * import `node:*`). Typed via an inline cast so it needs neither the DOM nor node type libs.
 */
export function newSegmentId(): string {
  return (globalThis as { crypto: { randomUUID(): string } }).crypto.randomUUID();
}

/**
 * Returns a copy of the cuesheet with a stable `id` assigned to every segment that lacks one;
 * segments that already have an id keep it, and their order is preserved.
 *
 * Assign-on-write: call this on write paths (web save, assemble, bridge update/patch) so ids get
 * persisted to disk. Do NOT mint ids at read/parse time (e.g. a zod default) - those ids would be
 * different on every read and never match a later id-addressed edit.
 */
export function ensureSegmentIds(cue: CueSheet): CueSheet {
  return {
    ...cue,
    segments: cue.segments.map((segment) =>
      segment.id === undefined ? { ...segment, id: newSegmentId() } : segment,
    ),
  };
}
