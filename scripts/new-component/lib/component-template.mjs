import fs from "node:fs";
import path from "node:path";

/**
 * Validates a component name against the PascalCase convention (CLAUDE.md "Component layering":
 * one folder per significant component, named after the component itself). Throws with an
 * actionable message on failure - callers surface it directly as a CLI error.
 */
export function validateComponentName(name) {
  if (!NAME_RE.test(name)) {
    throw new Error(
      `invalid component name "${name}": must be PascalCase (e.g. "MyWidget"), starting with an uppercase letter, letters/digits only`,
    );
  }
}

/**
 * Generates a new component folder at `<componentsRoot>/<name>/` from the templates in
 * `templatesDir` (scripts/new-component/templates/component/) - substitutes the `__NAME__`
 * (PascalCase) and `__TEST_ID__` (kebab-case) placeholders found in each template file, then
 * writes `<name>.tsx` / `<name>.styles.ts` / `<name>.test.tsx` / `index.ts` (the anatomy
 * `check-component-anatomy.mjs` enforces). Refuses if the target folder already exists.
 *
 * Returns the list of written file paths.
 */
export function generateComponent({ name, componentsRoot, templatesDir }) {
  validateComponentName(name);

  const componentDir = path.join(componentsRoot, name);
  if (fs.existsSync(componentDir)) {
    throw new Error(`${componentDir}: already exists (refusing to overwrite)`);
  }

  const replacements = { __NAME__: name, __TEST_ID__: pascalToKebab(name) };

  fs.mkdirSync(componentDir, { recursive: true });

  const written = [];
  for (const templateName of fs.readdirSync(templatesDir)) {
    const raw = fs.readFileSync(path.join(templatesDir, templateName), "utf8");
    const outputPath = path.join(componentDir, templateName.replace(/^Component/, name));
    fs.writeFileSync(outputPath, applyReplacements(raw, replacements));
    written.push(outputPath);
  }

  return written;
}

function applyReplacements(content, replacements) {
  let result = content;
  for (const [token, value] of Object.entries(replacements)) {
    result = result.replaceAll(token, value);
  }
  return result;
}

/** "MyWidget" -> "my-widget" (used for the root element's data-testid). */
function pascalToKebab(name) {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

const NAME_RE = /^[A-Z][A-Za-z0-9]*$/;
