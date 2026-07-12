/**
 * Finds title-preset drift in docs/USER-GUIDE.md - the machine-enforced form of "the title
 * presets the guide names always match the schema's titlePresetSchema". Motivated by a real
 * incident: the guide listed pre-rename presets (typing/gooey/melt/particle) long after the
 * schema became (fade/wordStagger/typing/highlight), silently misleading readers/agents.
 *
 * `guideText` is the raw USER-GUIDE.md text. `validPresets` is the schema's preset list
 * (injected so this matcher stays pure/unit-testable without needing the @cuesheet/schema build).
 * The guide is expected to name the presets as a parenthesized slash-list right after the word
 * "preset(s)", e.g. "one of 4 presets (fade/wordStagger/typing/highlight)".
 */
export function findUserGuidePresetViolations(guideText, validPresets) {
  const violations = [];
  const valid = [...validPresets].sort();
  const normalized = guideText.replace(/\s+/g, " ");

  // Parenthesized slash-list anchored to the word "preset(s)"; only pure-alpha tokens qualify
  // (so "(mp3/m4a/wav)", "(720p/1080p/4K)", or "(e.g. ...)" never match).
  const re = /preset[s]?\b[^()]{0,60}?\(([^)]+)\)/gi;
  const candidates = [];
  let match;
  while ((match = re.exec(normalized)) !== null) {
    const parts = match[1].split("/").map((token) => token.trim());
    if (parts.length >= 2 && parts.every((token) => /^[a-zA-Z]+$/.test(token))) {
      candidates.push(parts);
    }
  }

  if (candidates.length === 0) {
    violations.push(
      `docs/USER-GUIDE.md: no title-preset list found - expected a parenthesized list after "preset(s)", e.g. (${valid.join("/")})`,
    );
    return violations;
  }

  for (const parts of candidates) {
    const got = [...parts].sort();
    const matches = got.length === valid.length && got.every((token, i) => token === valid[i]);
    if (!matches) {
      violations.push(
        `docs/USER-GUIDE.md: title presets (${parts.join("/")}) do not match the schema's titlePresetSchema (${validPresets.join("/")})`,
      );
    }
  }
  return violations;
}
