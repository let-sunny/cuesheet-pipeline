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
    "must be a hex color (e.g. #ffffff or #fff)",
  );

export const projectSchema = z.object({
  name: z.string().min(1, "project.name must not be empty"),
  fps: z.number().positive("fps must be positive"),
  width: z.number().int("width must be an integer").positive("width must be positive"),
  height: z.number().int("height must be an integer").positive("height must be positive"),
});

/**
 * 세그먼트 단위 크롭. 원본 해상도 기준 **비율(0~1)**로 정의(해상도 독립적).
 * x,y = 좌상단, w,h = 크기. 예: 얼굴 상단을 잘라내는 세로 크롭
 * { x: 0, y: 0.25, w: 1, h: 0.75 }.
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
 * 자막 뒤 반투명 배경 박스(유튜브 기본 자막 스타일). 생략/null이면 배경 없음(기존 동작).
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
  // 자막 뒤 반투명 배경 박스. 생략/null = 배경 없음(기존 동작 100% 유지).
  background: subtitleBackgroundSchema.nullable().optional(),
  // top/bottom일 때 가장자리로부터의 여백(px). center는 이 값을 무시한다.
  // 생략 시 40(기존 하드코딩 값과 동일) — 기존 큐시트 렌더 결과가 그대로 유지된다.
  margin: z
    .number()
    .min(8, "margin must be >= 8")
    .max(600, "margin must be <= 600")
    .default(40),
});

/**
 * 컷(세그먼트)별 자막 스타일 부분 오버라이드. subtitleStyle의 모든 필드가 선택 필드다.
 * 생략된 필드는 전역 subtitleStyle 값을 그대로 쓴다(얕은 병합, render 쪽에서 적용).
 * background만 예외: 지정하면 전역 background를 부분 병합이 아니라 통짜 교체한다
 * (부분 병합 시 색만 바꾸고 opacity가 전역 값으로 남는 등 애매함이 생기기 때문).
 *
 * margin은 `.partial()`만으로는 부족해 별도로 재선언한다: subtitleStyleSchema의
 * margin은 `.default(40)`이 있어 `.partial()`을 걸어도(선택 필드가 되어도) 생략 시
 * zod가 기본값 40을 채워 넣는다 — 그러면 병합할 때 "margin은 안 건드리려던" 오버라이드가
 * 항상 margin을 40으로 덮어써 버린다(부분 병합 취지 위반). 여기서는 기본값 없는
 * 선택 필드로 둬서 생략 시 진짜로 키 자체가 없게(undefined) 한다.
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
      .default(1.0), // 이 세그먼트 오디오 볼륨. 1.0=원본, 0.3="30% 수준", 0=무음
    subtitle: z.string(), // 빈 문자열 허용
    // 이 컷에 얹을 내레이션 오디오 파일명(narration.dir 기준). null/생략이면 내레이션 없음.
    narration: z.string().min(1, "narration filename must not be empty").nullable().optional(),
    // 원본 해상도 기준 비율 크롭(0~1). null/생략이면 크롭 없음(원본 그대로).
    crop: cropSchema.nullable().optional(),
    // 이 컷만의 자막 스타일 부분 오버라이드. null/생략이면 전역 subtitleStyle 그대로.
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
 * 목소리 클로닝 내레이션 배관(피처 플래그). enabled가 false거나 이 필드 자체가
 * 없으면 렌더는 기존 동작과 100% 동일해야 한다. dir은 clipDir와 같은 철학으로
 * 내레이션 오디오 파일들이 있는 디렉토리(파일명은 segment.narration에 저장).
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
