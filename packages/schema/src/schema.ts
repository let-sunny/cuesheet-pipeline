import { z } from "zod";

/**
 * Cuesheet schema (zod). This file is the single source of truth for types/validation.
 * TypeScript types are derived here via z.infer and exported from `types.ts`.
 *
 * Unit conventions:
 * - All time values are in seconds. Frame conversion is handled by the render module using fps.
 * - Clips are stored as filename only (`segment.clip`); the folder is kept separate as `clipDir`.
 */

/** Hex color in #RGB or #RRGGBB form */
const hexColor = z
  .string()
  .regex(
    /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/,
    "must be a hex color (e.g. #ffffff or #fff)",
  );

export const projectSchema = z.object({
  name: z.string().min(1, "project.name must not be empty"),
  fps: z.number().positive("fps must be positive"),
  width: z.number().int("width must be an integer").positive("width must be positive"),
  height: z.number().int("height must be an integer").positive("height must be positive"),
});

/**
 * Per-segment crop. Defined as a **ratio (0-1)** relative to the source resolution
 * (resolution-independent). x,y = top-left, w,h = size. Example: a vertical crop that
 * cuts off the top of the face: { x: 0, y: 0.25, w: 1, h: 0.75 }.
 */
export const cropSchema = z
  .object({
    x: z.number().nonnegative("crop.x must be >= 0"),
    y: z.number().nonnegative("crop.y must be >= 0"),
    w: z.number().gt(0.1, "crop.w must be > 0.1"),
    h: z.number().gt(0.1, "crop.h must be > 0.1"),
  })
  .refine((c) => c.x + c.w <= 1, {
    error: "crop.x + crop.w must be <= 1",
    path: ["x"],
  })
  .refine((c) => c.y + c.h <= 1, {
    error: "crop.y + crop.h must be <= 1",
    path: ["y"],
  });

/**
 * Semi-transparent background box behind the subtitle (YouTube's default subtitle
 * style). If omitted/null, there's no background (existing behavior).
 */
export const subtitleBackgroundSchema = z.object({
  color: hexColor,
  opacity: z
    .number()
    .min(0, "background.opacity must be >= 0")
    .max(1, "background.opacity must be <= 1"),
  padding: z
    .number()
    .min(0, "background.padding must be >= 0")
    .max(120, "background.padding must be <= 120")
    .default(8),
});

export const subtitleStyleSchema = z.object({
  font: z.string().min(1, "font must not be empty"),
  size: z.number().positive("size must be positive"),
  color: hexColor,
  outlineColor: hexColor,
  outlineWidth: z.number().nonnegative("outlineWidth must be >= 0"),
  position: z.enum(["bottom", "top", "center"]),
  // Semi-transparent background box behind the subtitle. Omitted/null = no background (100% preserves existing behavior).
  background: subtitleBackgroundSchema.nullable().optional(),
  // Margin from the edge (px) when position is top/bottom. Ignored for center.
  // Defaults to 40 if omitted (same as the old hardcoded value) — existing cuesheets render identically.
  margin: z
    .number()
    .min(8, "margin must be >= 8")
    .max(600, "margin must be <= 600")
    .default(40),
});

/**
 * Per-cut (per-segment) partial override of the subtitle style. Every field of
 * subtitleStyle is optional here. An omitted field falls back to the global
 * subtitleStyle value (shallow merge, applied on the render side). background is the
 * one exception: if specified, it replaces the global background wholesale rather
 * than being partially merged (a partial merge would create ambiguity, e.g. changing
 * only the color while opacity stays at the global value).
 *
 * margin needs to be redeclared separately because `.partial()` alone isn't enough:
 * subtitleStyleSchema's margin has `.default(40)`, so even after `.partial()` makes it
 * optional, zod still fills in the default of 40 when it's omitted — which means an
 * override that "didn't intend to touch margin" would always overwrite margin to 40
 * on merge (defeating the purpose of a partial override). Here it's redeclared as an
 * optional field with no default, so omitting it truly leaves the key absent (undefined).
 */
export const subtitleStyleOverrideSchema = subtitleStyleSchema.partial().extend({
  margin: z
    .number()
    .min(8, "margin must be >= 8")
    .max(600, "margin must be <= 600")
    .optional(),
});

export const segmentSchema = z
  .object({
    clip: z.string().min(1, "clip filename must not be empty"),
    in: z.number().nonnegative("in must be >= 0"),
    out: z.number().positive("out must be positive"),
    speed: z.number().positive("speed must be > 0").default(1.0),
    volume: z
      .number()
      .min(0, "volume must be >= 0.0")
      .max(1, "volume must be <= 1.0")
      .default(1.0), // This segment's audio volume. 1.0=original, 0.3="30% level", 0=muted
    subtitle: z.string(), // empty string allowed
    // Narration audio filename for this cut (relative to narration.dir). null/omitted = no narration.
    narration: z.string().min(1, "narration filename must not be empty").nullable().optional(),
    // Ratio-based crop (0-1) relative to the source resolution. null/omitted = no crop (source as-is).
    crop: cropSchema.nullable().optional(),
    // Partial subtitle style override for this cut only. null/omitted = use global subtitleStyle as-is.
    styleOverride: subtitleStyleOverrideSchema.nullable().optional(),
  })
  .refine((s) => s.in < s.out, {
    error: "in must be less than out (in < out)",
    path: ["in"],
  });

export const bgmCueSchema = z
  .object({
    file: z.string().min(1, "bgm.file must not be empty"),
    start: z.number().nonnegative("start must be >= 0"),
    end: z.number().positive("end must be positive"),
    volume: z
      .number()
      .min(0, "volume must be >= 0.0")
      .max(1, "volume must be <= 1.0"),
  })
  .refine((b) => b.start < b.end, {
    error: "start must be less than end (start < end)",
    path: ["start"],
  });

/**
 * Voice-cloned narration plumbing (feature flag). If enabled is false or this field
 * is absent entirely, render must behave 100% identically to before. dir follows the
 * same philosophy as clipDir: the directory containing the narration audio files
 * (filenames are stored in segment.narration).
 */
export const narrationConfigSchema = z.object({
  enabled: z.boolean(),
  dir: z.string().min(1, "narration.dir must not be empty"),
  volume: z
    .number()
    .min(0, "volume must be >= 0.0")
    .max(1, "volume must be <= 1.0")
    .default(1.0),
});

export const cueSheetSchema = z.object({
  project: projectSchema,
  clipDir: z.string().min(1, "clipDir must not be empty"),
  intro: z.string().min(1).nullable(),
  outro: z.string().min(1).nullable(),
  segments: z.array(segmentSchema).min(1, "segments must have at least 1 item"),
  bgm: z.array(bgmCueSchema),
  subtitleStyle: subtitleStyleSchema,
  narration: narrationConfigSchema.optional(),
});
