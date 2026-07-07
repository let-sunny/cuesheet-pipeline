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
  subtitleStyleSchema,
} from "./schema.js";

/**
 * 타입은 zod 스키마에서 파생한다(single source of truth).
 * `z.infer`는 검증 후 출력 타입 = speed 같은 default가 적용된 형태.
 */
export type Project = z.infer<typeof projectSchema>;
export type Crop = z.infer<typeof cropSchema>;
export type Segment = z.infer<typeof segmentSchema>;
export type BgmCue = z.infer<typeof bgmCueSchema>;
export type SubtitleBackground = z.infer<typeof subtitleBackgroundSchema>;
export type SubtitleStyle = z.infer<typeof subtitleStyleSchema>;
export type SubtitleStyleOverride = z.infer<typeof subtitleStyleOverrideSchema>;
export type NarrationConfig = z.infer<typeof narrationConfigSchema>;
export type CueSheet = z.infer<typeof cueSheetSchema>;

/** 검증 전 입력 타입(default 미적용). 웹앱에서 부분 입력을 다룰 때 유용. */
export type CueSheetInput = z.input<typeof cueSheetSchema>;
