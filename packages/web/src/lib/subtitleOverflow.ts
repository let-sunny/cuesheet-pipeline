/**
 * Cheap heuristic for "this subtitle might overflow the frame at render time". drawtext (the
 * ffmpeg filter that actually burns the subtitle in) never wraps text - a run of characters with
 * no spaces just draws off both edges of the frame. Exact wrap parity with drawtext isn't
 * feasible client-side (it depends on the actual font metrics), so this is only a rough
 * character-count-vs-estimated-pixel-width guard, not a precise prediction - the same heuristic
 * (and the same ratio) is mirrored in @cuesheet/render's render-time guard (plan.ts), which is the
 * last line of defense since it runs right before the actual ffmpeg render.
 */
const AVG_CHAR_WIDTH_RATIO = 0.6;

/** The longest run of non-whitespace characters in text ("" if text is empty/all-whitespace). */
export function longestUnwrappableToken(text: string): string {
  return text
    .split(/\s+/)
    .reduce((longest, token) => (token.length > longest.length ? token : longest), "");
}

/** Rough estimated rendered width (px) of a run of charCount characters at fontSizePx. */
export function estimateTextWidthPx(charCount: number, fontSizePx: number): number {
  return charCount * fontSizePx * AVG_CHAR_WIDTH_RATIO;
}

/**
 * Returns a warning message if `text`'s longest unwrappable (no-space) run is estimated to be
 * wider than frameWidthPx at fontSizePx, or null if it looks fine.
 */
export function subtitleOverflowWarning(
  text: string,
  fontSizePx: number,
  frameWidthPx: number,
): string | null {
  const token = longestUnwrappableToken(text);
  if (token.length === 0) {
    return null;
  }
  const estimatedWidthPx = estimateTextWidthPx(token.length, fontSizePx);
  if (estimatedWidthPx <= frameWidthPx) {
    return null;
  }
  return `This subtitle has a ${token.length}-character run with no spaces - it may not fit the frame width at render (estimate only, drawtext doesn't wrap).`;
}
