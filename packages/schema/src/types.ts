import type { z } from "zod";
import type {
  bgmCueSchema,
  cropSchema,
  cueSheetSchema,
  narrationConfigSchema,
  projectSchema,
  segmentSchema,
  subtitleBackgroundSchema,
  subtitleStyleOverrideSchema,
  subtitleStylePresetsSchema,
  subtitleStyleSchema,
  titleBackdropSchema,
  titlePresetSchema,
  titleSchema,
  transitionSchema,
} from "./schema.js";

/**
 * Types are derived from the zod schema (single source of truth).
 * `z.infer` is the post-validation output type — i.e. with defaults like speed applied.
 */
export type Project = z.infer<typeof projectSchema>;
export type Crop = z.infer<typeof cropSchema>;
export type Segment = z.infer<typeof segmentSchema>;
export type BgmCue = z.infer<typeof bgmCueSchema>;
export type SubtitleBackground = z.infer<typeof subtitleBackgroundSchema>;
export type SubtitleStyle = z.infer<typeof subtitleStyleSchema>;
export type SubtitleStyleOverride = z.infer<typeof subtitleStyleOverrideSchema>;
export type SubtitleStylePresets = z.infer<typeof subtitleStylePresetsSchema>;
export type TitlePreset = z.infer<typeof titlePresetSchema>;
export type TitleBackdrop = z.infer<typeof titleBackdropSchema>;
export type Title = z.infer<typeof titleSchema>;
export type Transition = z.infer<typeof transitionSchema>;
export type NarrationConfig = z.infer<typeof narrationConfigSchema>;
export type CueSheet = z.infer<typeof cueSheetSchema>;

/** Pre-validation input type (defaults not applied). Useful when the web app handles partial input. */
export type CueSheetInput = z.input<typeof cueSheetSchema>;
