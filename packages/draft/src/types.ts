import { z } from "zod";

/**
 * moments.json schema (zod). The file Claude writes by directly looking at the frames
 * from the scan stage's output (manifest.json) — the only vision-judgment step in this
 * project.
 *
 * Units are in seconds. `shotType` is an open string at the engine level - the actual vocabulary
 * is domain data (domains/<name>/shot-types.json), applied by `momentsFileSchemaFor` in domain.ts.
 * Knitting's vocabulary: hand-closeup / object / cat / change / reveal / wearing / other.
 */

export const shotTypeSchema = z.string().min(1, "shotType must not be empty");

export const momentSchema = z.object({
  inS: z.number(),
  outS: z.number(),
  shotType: shotTypeSchema,
  memo: z.string(),
  quality: z.number(),
});

export const monotonousRangeSchema = z.object({
  startS: z.number(),
  endS: z.number(),
  desc: z.string(),
  /**
   * Whether this range (a timelapse-connector candidate) carries face-exposure risk. If
   * the vision judge doesn't specify it, assemble falls back to a desc-text heuristic
   * (recommended: always specify this explicitly).
   */
  faceExposed: z.boolean().optional(),
});

export const clipMomentsSchema = z.object({
  clip: z.string(),
  clipSummary: z.string(),
  moments: z.array(momentSchema),
  monotonousRanges: z.array(monotonousRangeSchema),
});

export const momentsFileSchema = z.array(clipMomentsSchema);

export type ShotType = z.infer<typeof shotTypeSchema>;
export type Moment = z.infer<typeof momentSchema>;
export type MonotonousRange = z.infer<typeof monotonousRangeSchema>;
export type ClipMoments = z.infer<typeof clipMomentsSchema>;
