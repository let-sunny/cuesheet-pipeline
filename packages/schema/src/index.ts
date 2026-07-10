export {
  bgmCueSchema,
  cropSchema,
  cueSheetSchema,
  duckingSchema,
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

export type {
  BgmCue,
  Crop,
  CueSheet,
  CueSheetInput,
  Ducking,
  NarrationConfig,
  Project,
  Segment,
  SubtitleBackground,
  SubtitleStyle,
  SubtitleStyleOverride,
  SubtitleStylePresets,
  Title,
  TitleBackdrop,
  TitlePreset,
  Transition,
} from "./types.js";

export { validateCueSheet, formatIssue } from "./validate.js";
export type { ValidationResult } from "./validate.js";

export { deriveHint } from "./hints.js";

export { findLostFieldPaths } from "./lostKeys.js";
