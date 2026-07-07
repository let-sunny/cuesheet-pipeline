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
  /**
   * 이 구간(배속 커넥터 후보)에 얼굴 노출 위험이 있는지. 비전 판독자가 명시하지 않으면
   * assemble이 desc 텍스트 휴리스틱으로 폴백한다(권장: 항상 명시).
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
