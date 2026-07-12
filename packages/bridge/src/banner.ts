/**
 * Startup diagnostic banner for the MCP bridge. Printed to stderr when the bridge boots so a
 * Claude Code session can see, in its MCP logs, exactly what it attached to - which cuesheet file
 * is being edited, which tools are live, and a reminder that a stale (pre-rebuild) server does not
 * hot-reload. Both failure modes behind issue #29 (running an old dist, or editing the wrong
 * CUESHEET_PATH) become self-announcing instead of silent.
 *
 * Pure string builder (no I/O) so it is unit-testable; index.ts resolves the inputs and does the
 * single `console.error`. Never write this to stdout - stdout is the MCP stdio protocol channel.
 */
export interface StartupBannerInput {
  /** Absolute, resolved path of the cuesheet the bridge will edit (from CUESHEET_PATH). */
  cuesheetPath: string;
  /** Names of the tools this server registered. */
  toolNames: readonly string[];
  /** The bridge package version. */
  version: string;
  /** Whether the bridge is in read-only mode (CUESHEET_BRIDGE_READONLY=1). */
  readOnly: boolean;
}

export function formatStartupBanner(input: StartupBannerInput): string {
  const mode = input.readOnly ? "read-only" : "read-write";
  return [
    `cuesheet-bridge v${input.version} (${mode})`,
    `  editing: ${input.cuesheetPath}`,
    `  tools (${input.toolNames.length}): ${input.toolNames.join(", ")}`,
    "  note: restart this bridge after any `pnpm -r build` - MCP servers do not hot-reload.",
  ].join("\n");
}
