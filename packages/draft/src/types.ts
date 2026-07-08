import { z } from "zod";

/**
 * moments.json schema (zod). The file Claude writes by directly looking at the frames
 * from the scan stage's output (manifest.json) — the only vision-judgment step in this
 * project.
 *
 * Units are in seconds. The shotType vocabulary comes from observing the user's editing
 * grammar (hand closeup / object / cat / change / reveal / wearing shot).
 */

export const shotTypeSchema = z.enum([
  "hand-closeup",
  "object",
  "cat",
  "change",
  "reveal",
  "wearing",
  "other",
]);

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
