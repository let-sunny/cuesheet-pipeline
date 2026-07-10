/**
 * Pure parsing helpers for check-agents-doc.mjs: pull the "code-ish" surfaces AGENTS.md
 * documents (CLI invocations/flags, bridge tool table, HTTP endpoints, env vars) out of its raw
 * markdown text.
 *
 * Anti-brittleness design: every extractor anchors on code-ish tokens (fenced/backtick spans,
 * `| \`tool\` |` table rows) rather than sentence text, so rewording prose around a command
 * doesn't change what's extracted - only renaming/removing/adding a flag, tool, endpoint, or env
 * var (i.e. real drift) changes the result.
 */

/**
 * Flags (`--foo` tokens) that appear on a documented invocation of `commandToken` inside a
 * fenced code block, following continuation lines (indented, or after a trailing `\`) until a
 * blank/unindented line ends the invocation. Handles multiple invocations of the same command
 * documented back-to-back (e.g. `pnpm episode` shown once per flag) by re-matching commandToken
 * at the start of every unindented line, so flags accumulate across all of them.
 */
export function extractCommandFlags(markdown, commandToken) {
  const flags = new Set();
  let capturing = false;
  for (const line of markdown.split("\n")) {
    const trimmed = line.trim();
    const isIndentedContinuation = /^\s/.test(line) && trimmed.length > 0;
    if (!isIndentedContinuation) {
      capturing = trimmed.startsWith(commandToken);
    }
    if (capturing) {
      for (const match of line.matchAll(/--[a-z][a-z-]*/g)) flags.add(match[0]);
    }
  }
  return flags;
}

/** Bridge tool names from the MCP bridge table's first column (rows shaped `| \`tool_name\` | ... |`). */
export function extractBridgeToolNames(markdown) {
  const names = [];
  for (const match of markdown.matchAll(/^\|\s*`([a-z_]+)`\s*\|/gm)) {
    names.push(match[1]);
  }
  return names;
}

/**
 * HTTP endpoints documented as backtick-wrapped `METHOD /path...` spans (query strings and
 * trailing prose inside the same backtick span are stripped), deduped, as `"METHOD /path"`.
 */
export function extractHttpEndpoints(markdown) {
  const endpoints = new Set();
  for (const match of markdown.matchAll(/`(GET|POST|PUT|DELETE)\s+(\/[^\s`?]*)[^`]*`/g)) {
    endpoints.add(`${match[1]} ${match[2]}`);
  }
  return [...endpoints];
}

/**
 * Env var names referenced as backtick spans under this project's `CUESHEET_` naming convention
 * (e.g. `` `CUESHEET_PATH` ``, `` `CUESHEET_BRIDGE_READONLY=1` `` -> "CUESHEET_BRIDGE_READONLY"),
 * deduped. Scoped to this prefix rather than "any all-caps backtick span" to avoid false
 * positives on unrelated acronyms AGENTS.md also backtick-quotes (e.g. `` `PATH` ``, the OS env
 * var ffmpeg must be on - not one this project defines or can grep a source reference for).
 */
export function extractEnvVarNames(markdown) {
  const names = new Set();
  for (const match of markdown.matchAll(/`(CUESHEET_[A-Z0-9_]+)(?:=[^`]*)?`/g)) {
    names.add(match[1]);
  }
  return [...names];
}

/**
 * Whether `flag` (e.g. "--boundary-pad") is actually read somewhere in `sourceText` - catches a
 * flag documented in AGENTS.md that source no longer reads (renamed/removed). Matches whichever
 * convention the CLI in question uses: the literal dashed flag (`args.includes("--no-subtitles")`),
 * a quoted stripped key (`flags["boundary-pad"]`), or dot access for a stripped key with no
 * internal dashes (`flags.config`).
 */
export function isFlagReferencedInSource(flag, sourceText) {
  const key = flag.replace(/^--/, "");
  if (sourceText.includes(`"${flag}"`) || sourceText.includes(`'${flag}'`)) return true;
  if (sourceText.includes(`"${key}"`) || sourceText.includes(`'${key}'`)) return true;
  if (/^[a-z][a-z0-9]*$/.test(key) && new RegExp(`\\.${key}\\b`).test(sourceText)) return true;
  return false;
}
