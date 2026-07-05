import { z } from "zod";

/**
 * moments.json 스키마 (zod). scan 단계 산출물(manifest.json)의 프레임을 Claude가
 * 직접 보고 작성하는 파일 — 이 프로젝트에서 유일한 비전 판단 단계.
 *
 * 단위는 초(second). shotType 어휘는 사용자 편집 문법 실측(손 클로즈업/오브젝트/고양이/
 * 형태변화·리빌/착용샷)에서 가져왔다.
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
