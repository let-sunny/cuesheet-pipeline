/**
 * Finds class-name-based DOM selection inside test files - the machine-enforced form of
 * CLAUDE.md's "tests always select by data-testid (or ARIA role) - never by class name" rule
 * (this has a real motivating incident: a class-based probe silently broke when a styling
 * refactor renamed the class it depended on).
 *
 * Flags `querySelector`/`querySelectorAll` calls whose first argument is a CSS class selector
 * (starts with `.`) and any use of `getElementsByClassName`. Selecting by tag name
 * (`querySelector("img")`) or by `data-*`/ARIA attribute selectors is left untouched.
 *
 * `files` is `{ path, content }[]` (content may be null for binary files, which are skipped).
 */
export function findTestSelectorViolations(files) {
  const violations = [];
  for (const { path: filePath, content } of files) {
    if (content == null) continue;

    const lines = content.split("\n");
    lines.forEach((line, index) => {
      if (CLASS_SELECTOR_RE.test(line) || GET_BY_CLASS_NAME_RE.test(line)) {
        violations.push(`${filePath}:${index + 1}: class-name DOM selection in a test (use data-testid or an ARIA role query instead)`);
      }
    });
  }
  return violations;
}

const CLASS_SELECTOR_RE = /querySelector(All)?\(\s*["'`]\./;
const GET_BY_CLASS_NAME_RE = /getElementsByClassName\s*\(/;
