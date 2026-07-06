import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { findLostFieldPaths, validateCueSheet } from "@cuesheet/schema";
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
  if (!result.ok) {
    return result;
  }

  // web의 /api/cuesheet와 동일한 리스크: zod object는 정의되지 않은 키를 조용히
  // 제거(strip)한다. 서버가 구버전 스키마를 로드한 상태면 새 필드(예: crop)가
  // 조용히 유실된 채로 저장될 수 있다 — 저장 전 원본(next)과 직렬화 결과(result.data)의
  // 키 집합을 비교해 사라진 경로가 있으면 저장을 거부한다.
  const lostPaths = findLostFieldPaths(next, result.data);
  if (lostPaths.length > 0) {
    return {
      ok: false,
      errors: [`저장 시 필드 유실 감지: ${lostPaths.join(", ")} - 서버 재시작(스키마 갱신) 필요`],
    };
  }

  writeFileSync(path, `${JSON.stringify(result.data, null, 2)}\n`, "utf-8");
  return result;
}
