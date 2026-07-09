export {
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
} from "./schema.js";

export type {
  BgmCue,
  Crop,
  CueSheet,
  CueSheetInput,
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
} from "./types.js";

export { validateCueSheet, formatIssue } from "./validate.js";
export type { ValidationResult } from "./validate.js";

export { findLostFieldPaths } from "./lostKeys.js";
