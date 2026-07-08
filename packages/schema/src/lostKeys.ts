/**
 * "field loss" guard right before saving.
 *
 * By default, a zod object schema silently strips keys that aren't defined in it.
 * If the server process hasn't restarted yet and a client sends a field the schema
 * doesn't know about yet (e.g. crop), validateCueSheet still succeeds (ok:true), but
 * that field disappears from result.data — saving it as-is would silently lose that field.
 *
 * This function recursively compares the original (pre-validation) value against the
 * serialized (post-validation) result, and returns every key path where the original
 * had a value (i.e. was not undefined) but that key is missing from the serialized
 * output. A change to the value itself (type coercion, default-filling, etc.) doesn't
 * count as loss — only a key disappearing entirely counts as loss.
 *
 * Path notation matches the error messages in validate.ts (e.g. "segments[0].crop").
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
    // orig is a primitive and ser is defined too — a change to the value itself isn't loss, so pass.
  }
}
