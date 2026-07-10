import type { Segment } from "@cuesheet/schema";
import { formatIssue, segmentSchema } from "@cuesheet/schema";

/**
 * Returns the schema's own "in must be less than out" message (with its swap hint, e.g.
 * "in: in must be less than out (in < out) — swap to in=30, out=100") when this segment's in/out
 * is currently invalid, or null when in/out is valid.
 *
 * Single-sourced from segmentSchema/formatIssue - the exact wording Save's validation error would
 * show for this same problem - so an inline hint here can never drift from what Save reports.
 * Ignores every other possible issue on the segment (e.g. an unrelated field also being invalid);
 * this only surfaces the in/out ordering problem, which is the one thing the Range group's Length
 * readout is in a position to explain inline.
 */
export function segmentRangeError(segment: Segment): string | null {
  const result = segmentSchema.safeParse(segment, { reportInput: true });
  if (result.success) {
    return null;
  }
  const issue = result.error.issues.find(
    (i) => i.code === "custom" && i.path.length === 1 && i.path[0] === "in" && i.message.includes("in < out"),
  );
  return issue ? formatIssue(issue) : null;
}
