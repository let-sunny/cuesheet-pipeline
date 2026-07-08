#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

/**
 * MCP bridge that Claude Code connects to.
 * When the user gives natural-language commands in their own Claude Code,
 * Claude Code edits the cuesheet using these tools. No separate Claude API
 * call is made (no extra cost).
 *
 * The cuesheet file to edit is specified via the CUESHEET_PATH env var
 * (default ./project.cuesheet.json). The web app watches this file to
 * refresh its preview.
 */
const CUESHEET_PATH = process.env.CUESHEET_PATH ?? "./project.cuesheet.json";

const server = createServer(CUESHEET_PATH);
const transport = new StdioServerTransport();
await server.connect(transport);
