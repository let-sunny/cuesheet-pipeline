/**
 * 저장 직전 "필드 유실" 가드.
 *
 * zod object 스키마는 기본적으로 정의되지 않은 키를 조용히 제거한다(strip). 서버
 * 프로세스가 재시작 전이라 스키마에 아직 없는 필드(예: crop)를 클라이언트가 보내면,
 * validateCueSheet는 성공(ok:true)하지만 result.data에서 그 필드가 사라진다 —
 * 그대로 저장하면 그 필드가 조용히 유실된다.
 *
 * 이 함수는 검증 "전" 원본(original)과 검증 "후" 직렬화 결과(serialized)를 재귀적으로
 * 비교해, 원본에 값이 있었는데(undefined가 아니었는데) 직렬화본에서 사라진 키 경로를
 * 모두 찾아 돌려준다. 값 자체의 변형(타입 강제·기본값 채움 등)은 유실이 아니다 — 오직
 * "키가 통째로 사라짐"만 유실로 본다.
 *
 * 경로 표기는 validate.ts의 에러 메시지와 같은 형식(예: "segments[0].crop").
 */
export function findLostFieldPaths(original: unknown, serialized: unknown): string[] {
  const lost: string[] = [];
  walk(original, serialized, "");
  return lost;

  function walk(orig: unknown, ser: unknown, path: string): void {
    if (orig === undefined) {
      return;
    }
    if (ser === undefined) {
      lost.push(path || "(root)");
      return;
    }
    if (Array.isArray(orig)) {
      if (!Array.isArray(ser)) {
        lost.push(path || "(root)");
        return;
      }
      orig.forEach((item, i) => walk(item, ser[i], `${path}[${i}]`));
      return;
    }
    if (orig !== null && typeof orig === "object") {
      if (ser === null || typeof ser !== "object" || Array.isArray(ser)) {
        lost.push(path || "(root)");
        return;
      }
      const serObj = ser as Record<string, unknown>;
      for (const [key, value] of Object.entries(orig as Record<string, unknown>)) {
        if (value === undefined) {
          continue;
        }
        const childPath = path ? `${path}.${key}` : key;
        if (!(key in serObj)) {
          lost.push(childPath);
        } else {
          walk(value, serObj[key], childPath);
        }
      }
      return;
    }
    // 원시값(primitive)이고 ser도 정의돼 있음 — 값 자체의 변형은 유실이 아니므로 통과.
  }
}
