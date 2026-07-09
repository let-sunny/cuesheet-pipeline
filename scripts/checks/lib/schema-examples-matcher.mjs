/**
 * Finds schema violations in cuesheet example fixtures - the machine-enforced form of "the
 * examples under packages/schema/examples/ are always a valid cuesheet".
 *
 * `examples` is `{ path, raw }[]` (raw JSON text). `validateCueSheet` is injected so this matcher
 * stays pure/unit-testable without needing the real @cuesheet/schema build.
 */
export function findSchemaExampleViolations(examples, validateCueSheet) {
  const violations = [];
  for (const { path: filePath, raw } of examples) {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      violations.push(`${filePath}: invalid JSON (${error.message})`);
      continue;
    }

    const result = validateCueSheet(parsed);
    if (!result.ok) {
      for (const message of result.errors) {
        violations.push(`${filePath}: ${message}`);
      }
    }
  }
  return violations;
}
