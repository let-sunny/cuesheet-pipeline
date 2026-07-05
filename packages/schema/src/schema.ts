import { z } from "zod";

/**
 * 큐시트 스키마 (zod). 이 파일이 타입/검증의 single source of truth.
 * TypeScript 타입은 여기서 z.infer로 파생되어 `types.ts`에서 export된다.
 *
 * 단위 규칙:
 * - 모든 시간 값은 초(second) 기준. 프레임 환산은 render 모듈이 fps로 처리.
 * - 클립은 파일명만 저장(`segment.clip`), 폴더는 `clipDir`로 분리.
 */

/** #RGB 또는 #RRGGBB 형태의 hex 색상 */
const hexColor = z
  .string()
  .regex(
    /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/,
    "hex 색상 형식이어야 합니다 (예: #ffffff 또는 #fff)",
  );

export const projectSchema = z.object({
  name: z.string().min(1, "project.name은 비어 있을 수 없습니다"),
  fps: z.number().positive("fps는 양수여야 합니다"),
  width: z.number().int("width는 정수여야 합니다").positive("width는 양수여야 합니다"),
  height: z.number().int("height는 정수여야 합니다").positive("height는 양수여야 합니다"),
});

export const segmentSchema = z
  .object({
    clip: z.string().min(1, "clip 파일명은 비어 있을 수 없습니다"),
    in: z.number().nonnegative("in은 0 이상이어야 합니다"),
    out: z.number().positive("out은 양수여야 합니다"),
    speed: z.number().positive("speed는 0보다 커야 합니다").default(1.0),
    volume: z
      .number()
      .min(0, "volume은 0.0 이상이어야 합니다")
      .max(1, "volume은 1.0 이하여야 합니다")
      .default(1.0), // 이 세그먼트 오디오 볼륨. 1.0=원본, 0.3="30% 수준", 0=무음
    subtitle: z.string(), // 빈 문자열 허용
    // 이 컷에 얹을 내레이션 오디오 파일명(narration.dir 기준). null/생략이면 내레이션 없음.
    narration: z.string().min(1, "narration 파일명은 비어 있을 수 없습니다").nullable().optional(),
  })
  .refine((s) => s.in < s.out, {
    error: "in은 out보다 작아야 합니다 (in < out)",
    path: ["in"],
  });

export const bgmCueSchema = z
  .object({
    file: z.string().min(1, "bgm.file은 비어 있을 수 없습니다"),
    start: z.number().nonnegative("start는 0 이상이어야 합니다"),
    end: z.number().positive("end는 양수여야 합니다"),
    volume: z
      .number()
      .min(0, "volume은 0.0 이상이어야 합니다")
      .max(1, "volume은 1.0 이하여야 합니다"),
  })
  .refine((b) => b.start < b.end, {
    error: "start는 end보다 작아야 합니다 (start < end)",
    path: ["start"],
  });

export const subtitleStyleSchema = z.object({
  font: z.string().min(1, "font는 비어 있을 수 없습니다"),
  size: z.number().positive("size는 양수여야 합니다"),
  color: hexColor,
  outlineColor: hexColor,
  outlineWidth: z.number().nonnegative("outlineWidth는 0 이상이어야 합니다"),
  position: z.enum(["bottom", "top", "center"]),
});

/**
 * 목소리 클로닝 내레이션 배관(피처 플래그). enabled가 false거나 이 필드 자체가
 * 없으면 렌더는 기존 동작과 100% 동일해야 한다. dir은 clipDir와 같은 철학으로
 * 내레이션 오디오 파일들이 있는 디렉토리(파일명은 segment.narration에 저장).
 */
export const narrationConfigSchema = z.object({
  enabled: z.boolean(),
  dir: z.string().min(1, "narration.dir은 비어 있을 수 없습니다"),
  volume: z
    .number()
    .min(0, "volume은 0.0 이상이어야 합니다")
    .max(1, "volume은 1.0 이하여야 합니다")
    .default(1.0),
});

export const cueSheetSchema = z.object({
  project: projectSchema,
  clipDir: z.string().min(1, "clipDir은 비어 있을 수 없습니다"),
  intro: z.string().min(1).nullable(),
  outro: z.string().min(1).nullable(),
  segments: z.array(segmentSchema).min(1, "segments는 최소 1개 이상이어야 합니다"),
  bgm: z.array(bgmCueSchema),
  subtitleStyle: subtitleStyleSchema,
  narration: narrationConfigSchema.optional(),
});
