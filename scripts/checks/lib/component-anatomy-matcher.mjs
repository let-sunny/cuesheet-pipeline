import fs from "node:fs";
import path from "node:path";

/**
 * Finds component-anatomy violations under `componentsRoot` (apps/web/src/components) - the
 * machine-enforced form of CLAUDE.md's "Component layering" convention: one folder per
 * significant component, holding `<Name>.tsx` + a co-located `<Name>.test.tsx` (or
 * `.browser.test.tsx`) + `index.ts`.
 *
 * - A `.tsx` file sitting directly under `componentsRoot` (not inside its own folder) is always
 *   reported.
 * - `ui/` is descended one extra level - each entry inside it is itself a component folder to
 *   check, since it groups thin wrapper components rather than being one itself.
 * - `testAllowlist` holds folder paths (relative to `componentsRoot`, e.g. "ui/ToolbarButton")
 *   that are exempt from the co-located-test requirement (documented thin wrappers).
 */
export function findComponentAnatomyViolations(componentsRoot, { testAllowlist = new Set() } = {}) {
  const violations = [];
  if (!fs.existsSync(componentsRoot)) return violations;

  for (const entry of fs.readdirSync(componentsRoot, { withFileTypes: true })) {
    if (entry.isFile()) {
      if (entry.name.endsWith(".tsx")) {
        violations.push(
          `${path.join(componentsRoot, entry.name)}: flat .tsx file directly under components/ (give it its own Component/ folder with index.ts + test)`,
        );
      }
      continue;
    }

    if (!entry.isDirectory()) continue;

    if (entry.name === "ui") {
      const uiRoot = path.join(componentsRoot, entry.name);
      for (const uiEntry of fs.readdirSync(uiRoot, { withFileTypes: true })) {
        if (uiEntry.isDirectory()) {
          checkComponentFolder(componentsRoot, uiRoot, uiEntry.name, testAllowlist, violations);
        }
      }
      continue;
    }

    checkComponentFolder(componentsRoot, componentsRoot, entry.name, testAllowlist, violations);
  }

  return violations;
}

function checkComponentFolder(componentsRoot, parentDir, folderName, testAllowlist, violations) {
  const folderPath = path.join(parentDir, folderName);
  const files = fs.readdirSync(folderPath);

  // Not every folder groups an eponymous component (e.g. a shared-hooks subfolder) - only
  // folders holding `<Name>.tsx` are held to the anatomy convention.
  if (!files.includes(`${folderName}.tsx`)) return;

  const relFolder = path.relative(componentsRoot, folderPath);

  if (!files.includes("index.ts")) {
    violations.push(`${folderPath}/index.ts: missing (every component folder needs an export gate)`);
  }

  const hasTest = files.includes(`${folderName}.test.tsx`) || files.includes(`${folderName}.browser.test.tsx`);
  if (!hasTest && !testAllowlist.has(relFolder)) {
    violations.push(`${folderPath}/${folderName}.test.tsx: missing (every component folder needs a co-located test)`);
  }
}
