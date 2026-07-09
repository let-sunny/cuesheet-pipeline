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
  // Odd width/height breaks libx264 encoding (yuv420p requires even dimensions) - ffmpeg fails
  // the render outright with an opaque error, so this is caught here instead, at save time.
  width: z
    .number()
    .int("width must be an integer")
    .positive("width must be positive")
    .refine((w) => w % 2 === 0, { error: "must be even for video encoding" }),
  height: z
    .number()
    .int("height must be an integer")
    .positive("height must be positive")
    .refine((h) => h % 2 === 0, { error: "must be even for video encoding" }),
  // Episode-level fade in/out at the very start/end of the whole export (PRD backlog #3). Optional
  // and unbounded-below-3s - omitted (undefined) means no episode fade, same as an existing
  // cuesheet saved before this field existed.
  fadeInS: z
    .number()
    .min(0, "fadeInS must be >= 0")
    .max(3, "fadeInS must be <= 3")
    .optional(),
  fadeOutS: z
    .number()
    .min(0, "fadeOutS must be >= 0")
    .max(3, "fadeOutS must be <= 3")
    .optional(),
});

/**
 * Per-segment crop. Defined as a **ratio (0-1)** relative to the source resolution
 * (resolution-independent). x,y = top-left, w,h = size. w must equal h (within a small
 * epsilon) — see cueSheetSchema's superRefine for why: for same-aspect sources, that's the
 * condition under which the crop preserves the project's aspect ratio. Example: a vertical
 * crop that cuts off the top of the face: { x: 0, y: 0.25, w: 0.75, h: 0.75 }.
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

/**
 * Named, reusable subtitle style presets (project-level dictionary, keyed by name e.g.
 * "inner-voice"/"shout"). Same shape as a per-cut override (every field optional) - a preset is
 * just a named override that a segment can opt into via `segment.stylePreset` instead of
 * repeating the same override fields on every cut that wants that look. Merge order (see
 * ARCHITECTURE.md): global subtitleStyle < preset (if segment.stylePreset references one) <
 * segment.styleOverride (per-cut override always wins last).
 */
export const subtitleStylePresetsSchema = z.record(
  z.string().min(1, "preset name must not be empty"),
  subtitleStyleOverrideSchema,
);

/** Optional dim layer behind a title card, fading in/out with it (0 = no dim, 1 = fully black). */
export const titleBackdropSchema = z.object({
  dim: z.number().min(0, "backdrop.dim must be >= 0").max(1, "backdrop.dim must be <= 1"),
});

/** Closed set of title-card animation presets (cozy knitting-vlog mood, user-finalized trio + Melt exit variant). */
export const titlePresetSchema = z.enum(["gooey", "melt", "particle", "typing"]);

/**
 * A title card shown at the start of a cut (optional field - PRD backlog #2). `typing` renders via
 * ASS/libass karaoke reveal at render time; `gooey`/`melt`/`particle` render via a headless
 * frame-capture -> alpha-overlay composite (see docs/research/title-render-spike.md). Both paths
 * share this one schema shape; the render-time branch is keyed off `preset`.
 */
export const titleSchema = z.object({
  text: z.string().min(1, "title.text must not be empty").max(80, "title.text must be <= 80 characters"),
  preset: titlePresetSchema,
  durationS: z
    .number()
    .min(0.5, "durationS must be >= 0.5")
    .max(10, "durationS must be <= 10")
    .default(3),
  backdrop: titleBackdropSchema.optional(),
});

/**
 * A fade/dip at one edge of a cut (PRD backlog #3). "fade" fades the whole composited frame
 * (video+subtitle+title) directly to/from black via ffmpeg's plain `fade` filter. "dip" instead
 * overlays a separate black layer whose peak opacity is `dim` (1 = fully black, same as a plain
 * fade; < 1 = a partial dip that never fully hides the frame) - same alpha-overlay technique as
 * title.backdrop's dim layer, just windowed to the cut boundary instead of a title's whole
 * duration. `dim` only has meaning for "dip" (render/preview both ignore it for "fade").
 */
export const transitionSchema = z.object({
  type: z.enum(["fade", "dip"]),
  durationS: z
    .number()
    .min(0.2, "durationS must be >= 0.2")
    .max(2, "durationS must be <= 2")
    .default(0.5),
  dim: z.number().min(0, "dim must be >= 0").max(1, "dim must be <= 1").optional(),
});

export const segmentSchema = z
  .object({
    clip: z.string().min(1, "clip filename must not be empty"),
    in: z.number().nonnegative("in must be >= 0"),
    out: z.number().positive("out must be positive"),
    // Capped at 16 - browsers throw a NotSupportedError setting HTMLMediaElement.playbackRate
    // above 16, which would otherwise make the Edit-step preview (VideoPreview/SequencePlayer)
    // crash on a segment with a higher speed.
    speed: z.number().positive("speed must be > 0").max(16, "speed must be <= 16").default(1.0),
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
    // References a key in the cuesheet-level subtitleStylePresets dictionary. null/omitted = no
    // preset. Cross-field validity (the name must actually exist in subtitleStylePresets) is
    // checked in cueSheetSchema's superRefine, since a segment alone can't see its sheet's presets.
    stylePreset: z.string().min(1, "stylePreset must not be empty").nullable().optional(),
    // Title card shown at this cut's start. null/omitted = no title.
    title: titleSchema.nullable().optional(),
    // Fade/dip at this cut's start/end (PRD backlog #3). null/omitted = no transition (hard cut,
    // existing behavior).
    transitionIn: transitionSchema.nullable().optional(),
    transitionOut: transitionSchema.nullable().optional(),
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
 * BGM ducking (PRD backlog #4, design sketch 2026-07-09): when a narration clip plays over a
 * BGM track, the BGM volume automatically dips. There is no per-cut field - ducking windows are
 * derived entirely from narration placements already in the cuesheet (segment output start +
 * narration clip duration), so this is a single project-level on/off + two shape knobs. Presence
 * of this object is the on/off toggle itself (undefined/omitted = no ducking, same as before this
 * field existed) - mirrors the optional-object-as-toggle pattern used by segment.title/
 * transitionIn elsewhere in this schema.
 */
export const duckingSchema = z.object({
  // How much the BGM dips: 0.6 (default) means the BGM is ducked down to 40% of its usual volume
  // while narration plays (1 - amount = the floor gain).
  amount: z
    .number()
    .min(0, "ducking.amount must be >= 0")
    .max(1, "ducking.amount must be <= 1")
    .default(0.6),
  // Ramp duration (seconds) at each edge of a ducking window (fade down entering, fade back up
  // leaving) - clamped at render time to half the window's own length for very short narrations.
  fadeS: z
    .number()
    .min(0.1, "ducking.fadeS must be >= 0.1")
    .max(1, "ducking.fadeS must be <= 1")
    .default(0.3),
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
  // BGM ducking (see duckingSchema above). Optional/omitted = no ducking - existing cuesheets
  // (including ones with narration already enabled) stay valid and render identically.
  ducking: duckingSchema.optional(),
});

/**
 * Tolerance for the crop/project-aspect-ratio check below (see cueSheetSchema's superRefine).
 */
const CROP_ASPECT_EPSILON = 0.005;

export const cueSheetSchema = z
  .object({
    project: projectSchema,
    clipDir: z.string().min(1, "clipDir must not be empty"),
    intro: z.string().min(1).nullable(),
    outro: z.string().min(1).nullable(),
    segments: z.array(segmentSchema).min(1, "segments must have at least 1 item"),
    bgm: z.array(bgmCueSchema),
    subtitleStyle: subtitleStyleSchema,
    narration: narrationConfigSchema.optional(),
    // Named subtitle style presets dictionary (keyed by name). Optional/omitted = no presets
    // defined - existing cuesheets stay valid.
    subtitleStylePresets: subtitleStylePresetsSchema.optional(),
  })
  .superRefine((cue, ctx) => {
    // crop.w and crop.h (see cropSchema) are ratios relative to the *source* frame's own
    // width/height, not the project's. Source clips are assumed to already share the
    // project's aspect ratio (project.width/project.height) — this project doesn't support
    // mixed-aspect sources (see packages/render's crop -> scale=W:H, which stretches to fill
    // without letterboxing). Deriving the invariant from that assumption: let
    // projectAspect = project.width / project.height. Since srcW/srcH === projectAspect
    // (same-aspect assumption), the crop window's own aspect in pixels is
    // (w*srcW)/(h*srcH) = (w/h) * projectAspect. For the crop to preserve projectAspect (no
    // distortion once scaled to W:H), (w/h) must equal 1 — i.e. w and h (the ratios) must be
    // equal, which is the check below.
    cue.segments.forEach((segment, i) => {
      if (!segment.crop) return;
      if (Math.abs(segment.crop.w - segment.crop.h) > CROP_ASPECT_EPSILON) {
        ctx.addIssue({
          code: "custom",
          message:
            "crop window must match the project aspect ratio (w and h ratios must be equal for same-aspect sources)",
          path: ["segments", i, "crop"],
        });
      }
    });
    // A segment's stylePreset must reference an existing key in subtitleStylePresets - a segment
    // alone can't validate this (it doesn't see the sheet's presets dictionary), so it's checked
    // here at the cuesheet level instead.
    cue.segments.forEach((segment, i) => {
      if (!segment.stylePreset) return;
      if (!cue.subtitleStylePresets || !(segment.stylePreset in cue.subtitleStylePresets)) {
        ctx.addIssue({
          code: "custom",
          message: `stylePreset "${segment.stylePreset}" does not reference an existing preset name`,
          path: ["segments", i, "stylePreset"],
        });
      }
    });
  });
