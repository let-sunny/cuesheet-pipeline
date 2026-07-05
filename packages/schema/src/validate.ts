import type { z } from "zod";
import { cueSheetSchema } from "./schema.js";
import type { CueSheet } from "./types.js";

export type ValidationResult =
  | { ok: true; data: CueSheet }
  | { ok: false; errors: string[] };

/** zod issue path(예: ["segments", 0, "in"])를 "segments[0].in" 형태로 변환 */
function pathToString(path: ReadonlyArray<PropertyKey>): string {
  let out = "";
  for (const key of path) {
    if (typeof key === "number") {
      out += `[${key}]`;
    } else {
      out += out ? `.${String(key)}` : String(key);
    }
  }
  return out || "(root)";
}

function formatIssue(issue: z.core.$ZodIssue): string {
  return `${pathToString(issue.path)}: ${issue.message}`;
}

/**
 * 큐시트 JSON을 검증한다.
 * 성공 시 파싱된 데이터(default 적용), 실패 시 어느 필드가 왜 틀렸는지
 * 명확한 에러 메시지 목록을 돌려준다.
 */
export function validateCueSheet(json: unknown): ValidationResult {
  const result = cueSheetSchema.safeParse(json);
  if (result.success) {
    return { ok: true, data: result.data };
  }
  return { ok: false, errors: result.error.issues.map(formatIssue) };
}
