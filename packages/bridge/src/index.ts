#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getCuesheet, updateCuesheet } from "./store.js";

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

const server = new McpServer({ name: "cuesheet-bridge", version: "0.0.0" });

server.registerTool(
  "get_cuesheet",
  {
    description: "Returns the current cuesheet (JSON). Always read this before editing.",
    inputSchema: {},
  },
  async () => {
    const r = getCuesheet(CUESHEET_PATH);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(r, null, 2) }],
      isError: !r.ok,
    };
  },
);

server.registerTool(
  "update_cuesheet",
  {
    description:
      "Replaces the entire cuesheet with a new value. Validated against the schema and only " +
      "saved if it passes. Whatever the edit (volume, trim, subtitle, order, etc.), compute " +
      "the whole new cuesheet and pass it. Read the current value with get_cuesheet first, " +
      "then send the whole object with only the needed parts changed. When setting " +
      "segment.crop, crop.w and crop.h (ratios) must be equal — they must match the project's " +
      "aspect ratio (assumes a same-aspect source).",
    inputSchema: { cuesheet: z.record(z.string(), z.unknown()) },
  },
  async ({ cuesheet }) => {
    const r = updateCuesheet(CUESHEET_PATH, cuesheet);
    return {
      content: [
        {
          type: "text" as const,
          text: r.ok ? "Saved" : `Validation failed — not saved:\n${r.errors.join("\n")}`,
        },
      ],
      isError: !r.ok,
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
