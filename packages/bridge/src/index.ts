#!/usr/bin/env node
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { resolveCuesheetPath } from "@cuesheet/active-episode";
import { formatStartupBanner } from "./banner.js";
import { BRIDGE_TOOL_NAMES, createServer } from "./server.js";

/**
 * MCP bridge that Claude Code connects to.
 * When the user gives natural-language commands in their own Claude Code,
 * Claude Code edits the cuesheet using these tools. No separate Claude API
 * call is made (no extra cost).
 *
 * Which cuesheet to edit is the active episode, resolved fresh on every tool
 * call: explicit CUESHEET_PATH env > the repo's .active-episode file >
 * ./project.cuesheet.json. Re-resolving per call (rather than pinning at
 * startup) lets the bridge follow episode switches without a restart, since an
 * MCP server outlives them. The web app edits the same active cuesheet.
 *
 * Setting CUESHEET_BRIDGE_READONLY=1 puts the bridge in read-only mode
 * (see issue #12): update_cuesheet refuses every call with a structured
 * error naming this env var, while get_cuesheet/validate_cuesheet/get_schema
 * keep working — for review-only sessions or demos.
 */
// dist/index.js -> dist -> bridge -> packages -> repo root
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const CUESHEET_BRIDGE_READONLY = process.env.CUESHEET_BRIDGE_READONLY === "1";
const resolvePath = () => resolveCuesheetPath({ repoRoot, env: process.env });

const server = createServer(resolvePath, { readOnly: CUESHEET_BRIDGE_READONLY });

// stderr only - stdout is the MCP stdio protocol channel. Tells the attached session what it
// actually got (which file, which tools, that a stale pre-rebuild server won't hot-reload). The
// path is re-resolved per call, so the banner shows the startup-time resolution.
const version = (createRequire(import.meta.url)("../package.json") as { version: string }).version;
console.error(
  formatStartupBanner({
    cuesheetPath: resolvePath(),
    toolNames: BRIDGE_TOOL_NAMES,
    version,
    readOnly: CUESHEET_BRIDGE_READONLY,
  }),
);
console.error("  editing path re-resolves per call (.active-episode / CUESHEET_PATH)");

const transport = new StdioServerTransport();
await server.connect(transport);
