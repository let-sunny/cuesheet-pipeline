import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { validateCueSheet } from "@cuesheet/schema";
import type { ValidationResult } from "@cuesheet/schema";

/** 큐시트 파일을 원본 그대로 읽는다(검증 전). 없으면 null. */
export function readRaw(path: string): unknown {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8"));
}

/**
 * 현재 큐시트를 검증해 반환한다.
 * 파일이 없거나 깨졌으면 ok:false + 이유.
 */
export function getCuesheet(path: string): ValidationResult {
  let raw: unknown;
  try {
    raw = readRaw(path);
  } catch (e) {
    return { ok: false, errors: [`큐시트 파일을 읽을 수 없습니다: ${String(e)}`] };
  }
  if (raw === null) {
    return { ok: false, errors: [`큐시트 파일이 없습니다: ${path}`] };
  }
  return validateCueSheet(raw);
}

/**
 * 큐시트 전체를 새 값으로 교체한다.
 * 스키마 검증을 통과해야만 저장한다(default가 적용된 canonical 형태로 기록).
 * 이 함수가 "자유도"의 핵심: Claude Code가 어떤 편집이든 새 큐시트를 통째로
 * 계산해 넘기면, 여기서 검증 후 안전하게 반영한다.
 */
export function updateCuesheet(path: string, next: unknown): ValidationResult {
  const result = validateCueSheet(next);
  if (result.ok) {
    writeFileSync(path, `${JSON.stringify(result.data, null, 2)}\n`, "utf-8");
  }
  return result;
}
