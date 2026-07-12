/**
 * Generalized "guarded-mechanical" doc pin (see docs/doc-surfaces.md): every `pnpm <script>` a
 * human-facing doc names must be a real root package.json script (or a pnpm builtin). Catches doc
 * drift where a doc keeps naming a renamed/removed script - a mechanical fact, never prose.
 *
 * `docs` = `{ path, text }[]`. `rootScripts` = the script names from root package.json (injected so
 * this matcher stays pure/unit-testable). Only bare `pnpm <script>` invocations are checked; flag
 * forms (`pnpm -r build`, `pnpm --filter X test`) are intentionally skipped - their real script
 * isn't a root script.
 */
export function findDocScriptViolations(docs, rootScripts) {
  const scripts = new Set(rootScripts);
  const violations = [];
  for (const { path, text } of docs) {
    // pnpm <name>, where <name> starts with a lowercase letter (a script-name candidate) rather
    // than a flag (-r / --filter). A fresh regex per doc keeps lastIndex isolated.
    const re = /\bpnpm\s+([a-z][a-z0-9:_-]*)/g;
    let match;
    while ((match = re.exec(text)) !== null) {
      const name = match[1];
      if (PNPM_BUILTINS.has(name) || scripts.has(name)) continue;
      violations.push(`${path}: references \`pnpm ${name}\`, which is not a root package.json script`);
    }
  }
  return violations;
}

/** pnpm subcommands that are builtins, not package.json scripts - never flagged. */
const PNPM_BUILTINS = new Set([
  "install",
  "i",
  "add",
  "remove",
  "rm",
  "update",
  "up",
  "exec",
  "dlx",
  "run",
  "why",
  "list",
  "ls",
  "outdated",
  "store",
  "link",
  "unlink",
  "import",
  "rebuild",
  "prune",
  "dedupe",
  "patch",
  "create",
  "publish",
  "pack",
]);
