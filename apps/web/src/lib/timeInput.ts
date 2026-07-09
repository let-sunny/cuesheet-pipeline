/**
 * Parses a time field's raw typed text (seconds-based, per project convention) into a number,
 * accepting the pro-NLE numeric-entry conventions researched in
 * `docs/research/trim-ux-conventions.md` section 4.4:
 *  - plain seconds ("12.5")
 *  - `M:SS.s` shorthand ("1:23.4" -> 83.4)
 *  - relative entry: a leading `+`/`-` is read as a delta from `current` ("+0.5" -> current+0.5,
 *    "-2" -> current-2) rather than a literal (negative) absolute time, which is never meaningful
 *    for these fields.
 * Returns null for anything unparseable (the caller falls back to reverting to the last committed
 * value, same as any other invalid input - see `useNumericField`).
 */
export function parseTimeInput(raw: string, current: number): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return null;
  }
  const relative = /^([+-])\s*(.+)$/.exec(trimmed);
  if (relative) {
    const magnitude = parseTimeValue(relative[2] ?? "");
    if (magnitude === null) {
      return null;
    }
    const sign = relative[1] === "-" ? -1 : 1;
    return current + sign * magnitude;
  }
  return parseTimeValue(trimmed);
}

/** Parses an absolute (non-relative) time value: `M:SS.s` shorthand or plain seconds. */
function parseTimeValue(text: string): number | null {
  const clock = /^(\d+):(\d+(?:\.\d+)?)$/.exec(text.trim());
  if (clock) {
    const minutes = Number(clock[1]);
    const seconds = Number(clock[2]);
    if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) {
      return null;
    }
    return minutes * 60 + seconds;
  }
  const n = Number(text.trim());
  return Number.isFinite(n) ? n : null;
}
