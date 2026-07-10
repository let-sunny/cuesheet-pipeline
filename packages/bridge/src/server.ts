import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildEditReceipt } from "./receipt.js";
import { getCuesheet, getCuesheetJsonSchema, updateCuesheet, validateCuesheet } from "./store.js";

/**
 * Builds the MCP server Claude Code connects to (see package README/AGENTS.md for the tool
 * surface). Split out from index.ts so tests can drive it over an in-memory transport instead
 * of spawning a stdio subprocess.
 */
export function createServer(cuesheetPath: string): McpServer {
  const server = new McpServer({ name: "cuesheet-bridge", version: "0.0.0" });

  server.registerTool(
    "get_cuesheet",
    {
      description:
        "When to use: always call this first before editing, to read the latest cuesheet value. " +
        "Returns the current cuesheet (JSON) or a validation error if the file is missing/invalid. " +
        "Example: get_cuesheet() -> {ok:true, data:{project:{...}, segments:[...], ...}}.",
      inputSchema: {},
    },
    async () => {
      const r = getCuesheet(cuesheetPath);
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
        "When to use: once you've computed the full new cuesheet for an edit (volume, trim, " +
        "subtitle, order, crop, etc.) and are ready to save it. Replaces the entire cuesheet " +
        "with the new value, validated against the schema — only saved if it passes. Read the " +
        "current value with get_cuesheet first, then send the whole object with only the needed " +
        "parts changed. When setting segment.crop, crop.w and crop.h (ratios) must be equal — " +
        "they must match the project's aspect ratio (assumes a same-aspect source). On success, " +
        "the response carries a receipt ({segmentCount, durationS, warnings}) computed from the " +
        "cuesheet that was actually written, so you can confirm the edit landed as intended " +
        "without a follow-up get_cuesheet call. " +
        "Example: update_cuesheet({cuesheet: {...same shape as get_cuesheet's data, edited...}}) " +
        "-> {ok:true, receipt:{segmentCount:12, durationS:76.4, warnings:[]}} or a list of " +
        "field-path: reason errors (nothing is written on failure).",
      inputSchema: { cuesheet: z.record(z.string(), z.unknown()) },
    },
    async ({ cuesheet }) => {
      const r = updateCuesheet(cuesheetPath, cuesheet);
      return {
        content: [
          {
            type: "text" as const,
            text: r.ok
              ? JSON.stringify({ ok: true, receipt: buildEditReceipt(r.data) }, null, 2)
              : `Validation failed — not saved:\n${r.errors.join("\n")}`,
          },
        ],
        isError: !r.ok,
      };
    },
  );

  server.registerTool(
    "validate_cuesheet",
    {
      description:
        "When to use: to check whether a candidate cuesheet would pass validation before " +
        "committing it with update_cuesheet — a dry run that never writes to disk. Useful when " +
        "trying out an edit, or when you want the full list of errors up front instead of a " +
        "failed save. Example: validate_cuesheet({cuesheet: {...}}) -> " +
        '{ok:false, errors:["segments[0].out: in must be less than out"]}.',
      inputSchema: { cuesheet: z.record(z.string(), z.unknown()) },
    },
    async ({ cuesheet }) => {
      const r = validateCuesheet(cuesheet);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(r, null, 2) }],
        isError: !r.ok,
      };
    },
  );

  server.registerTool(
    "get_schema",
    {
      description:
        "When to use: once at the start of a session (or whenever unsure of a field's shape, " +
        "type, or enum values) instead of guessing the cuesheet format from examples. Returns " +
        "the cuesheet format as a JSON Schema (draft 2020-12), generated directly from the same " +
        "zod schema get_cuesheet/update_cuesheet/validate_cuesheet validate against, so it can " +
        'never drift from the actual rules. Example: get_schema() -> {"$schema": ' +
        '"https://json-schema.org/draft/2020-12/schema", "type": "object", "properties": {...}}.',
      inputSchema: {},
    },
    async () => {
      const schema = getCuesheetJsonSchema();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(schema, null, 2) }],
        isError: false,
      };
    },
  );

  return server;
}
