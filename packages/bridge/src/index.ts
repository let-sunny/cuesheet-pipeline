#!/usr/bin/env node
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { formatStartupBanner } from "./banner.js";
import { BRIDGE_TOOL_NAMES, createServer } from "./server.js";

/**
 * MCP bridge that Claude Code connects to.
 * When the user gives natural-language commands in their own Claude Code,
 * Claude Code edits the cuesheet using these tools. No separate Claude API
 * call is made (no extra cost).
 *
 * The cuesheet file to edit is specified via the CUESHEET_PATH env var
 * (default ./project.cuesheet.json). The web app watches this file to
 * refresh its preview.
 *
 * Setting CUESHEET_BRIDGE_READONLY=1 puts the bridge in read-only mode
 * (see issue #12): update_cuesheet refuses every call with a structured
 * error naming this env var, while get_cuesheet/validate_cuesheet/get_schema
 * keep working — for review-only sessions or demos.
 */
const CUESHEET_PATH = process.env.CUESHEET_PATH ?? "./project.cuesheet.json";
const CUESHEET_BRIDGE_READONLY = process.env.CUESHEET_BRIDGE_READONLY === "1";

const server = createServer(CUESHEET_PATH, { readOnly: CUESHEET_BRIDGE_READONLY });

// stderr only - stdout is the MCP stdio protocol channel. Tells the attached session what it
// actually got (which file, which tools, that a stale pre-rebuild server won't hot-reload).
const version = (createRequire(import.meta.url)("../package.json") as { version: string }).version;
console.error(
  formatStartupBanner({
    cuesheetPath: resolve(CUESHEET_PATH),
    toolNames: BRIDGE_TOOL_NAMES,
    version,
    readOnly: CUESHEET_BRIDGE_READONLY,
  }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
