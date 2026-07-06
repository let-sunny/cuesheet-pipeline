import type { ClipMoments } from "./api.js";

/** 인트로/아웃트로는 구간 지정이 안 되는 통짜 클립이라, 이보다 긴 클립은 지정을 막는다. */
export const INTRO_OUTRO_MAX_DURATION_S = 15;

/** node:path 없이 브라우저에서 파일명만 뽑아낸다(경로 구분자 둘 다 대응). */
export function baseName(path: string): string {
  const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return idx === -1 ? path : path.slice(idx + 1);
}

/** 확장자를 뗀 파일명 — 프레임 폴더명과 일치시키는 데 쓴다. */
export function stem(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  return idx === -1 ? fileName : fileName.slice(0, idx);
}

/** clipDir + 클립 파일명 -> intro/outro 필드에 저장할 경로(schema 주석대로 clipDir와 무관한
 * 독립 경로이지만, 팔레트/인스펙터에서 지정할 땐 clipDir 밑 원본 파일을 가리키게 조합한다). */
export function buildClipPath(clipDir: string, clipFileName: string): string {
  return `${clipDir.replace(/\/+$/, "")}/${clipFileName}`;
}

/**
 * 클립별 길이 근사치(초). 실제 파일 길이를 ffprobe로 재지 않고, 초벌 하이라이트
 * 데이터(moments/monotonousRanges)에 찍힌 가장 늦은 시각을 길이 하한으로 쓴다 — 태깅 안 된
 * 뒷부분이 있으면 실제보다 짧게 잡힐 수 있는 근사치라는 전제를 깔고 간다(가정 명시).
 * ffprobe 추가 호출이나 별도 duration 캐시 라우트보다 이쪽이 훨씬 싸고, iCloud placeholder
 * 클립(blocks===0)을 잘못 건드려 멈출 위험도 없다.
 */
export function computeClipDurations(entries: ClipMoments[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const entry of entries) {
    const name = baseName(entry.clip);
    let max = 0;
    for (const m of entry.moments) {
      max = Math.max(max, m.outS);
    }
    for (const r of entry.monotonousRanges) {
      max = Math.max(max, r.endS);
    }
    map[name] = Math.max(map[name] ?? 0, max);
  }
  return map;
}
