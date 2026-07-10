import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildCuesheetDiff } from "./diff.js";
import { buildEditReceipt } from "./receipt.js";
import { getCuesheet, getCuesheetJsonSchema, updateCuesheet, validateCuesheet } from "./store.js";

/** Options controlling how {@link createServer} behaves. */
export interface CreateServerOptions {
  /**
   * When true, `update_cuesheet` refuses every call with a structured error instead of writing —
   * see issue #12. The tool stays registered (its description doesn't change per-mode, since MCP
   * clients may cache `tools/list`) so a caller always gets a clear, actionable refusal rather
   * than a "tool not found" dead end. Read/grounding tools (`get_cuesheet`, `validate_cuesheet`,
   * `get_schema`) are unaffected — read-only mode never blocks them.
   */
  readOnly?: boolean;
}

/**
 * Builds the MCP server Claude Code connects to (see package README/AGENTS.md for the tool
 * surface). Split out from index.ts so tests can drive it over an in-memory transport instead
 * of spawning a stdio subprocess.
 */
export function createServer(cuesheetPath: string, options: CreateServerOptions = {}): McpServer {
  const readOnly = options.readOnly ?? false;
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
        "without a follow-up get_cuesheet call. If the bridge is running in read-only mode " +
        "(CUESHEET_BRIDGE_READONLY set), this call is refused with a structured error instead of " +
        "writing — get_cuesheet/validate_cuesheet/get_schema remain usable. " +
        "Example: update_cuesheet({cuesheet: {...same shape as get_cuesheet's data, edited...}}) " +
        "-> {ok:true, receipt:{segmentCount:12, durationS:76.4, warnings:[]}} or a list of " +
        "field-path: reason errors (nothing is written on failure).",
      inputSchema: { cuesheet: z.record(z.string(), z.unknown()) },
    },
    async ({ cuesheet }) => {
      if (readOnly) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  ok: false,
                  errors: [
                    "update_cuesheet: refused — the bridge is running in read-only mode " +
                      "(CUESHEET_BRIDGE_READONLY is set). Unset CUESHEET_BRIDGE_READONLY (or set " +
                      "it to 0) and restart the bridge to allow writes again.",
                  ],
                },
                null,
                2,
              ),
            },
          ],
          isError: true,
        };
      }
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
        "failed save. On success, the response also carries a `diff` comparing the candidate " +
        "against the currently-saved cuesheet (segments added/removed/modified — identified by " +
        "clip+in/out, so a reorder reads as reordered rather than N unrelated adds+removes — " +
        "plus project/bgm/narration field changes and the output duration delta), so you can " +
        "preview exactly what the edit would change before calling update_cuesheet. `diff` is " +
        "omitted if there's no currently-saved cuesheet to compare against (e.g. first save). " +
        "Segment lists in the diff are capped at 5 entries each (added/removed/modified " +
        "independently); the matching *Total field always carries the true count. " +
        "Example: validate_cuesheet({cuesheet: {...}}) -> " +
        '{ok:false, errors:["segments[0].out: in must be less than out"]} or ' +
        '{ok:true, diff:{durationDeltaS:-4.2, segments:{added:[],addedTotal:0,removed:[...], ' +
        "removedTotal:2,modified:[],modifiedTotal:0,reordered:false},project:[],bgm:" +
        '{added:1,removed:0,modified:0},narration:{changed:false,fields:[]}}}.',
      inputSchema: { cuesheet: z.record(z.string(), z.unknown()) },
    },
    async ({ cuesheet }) => {
      const r = validateCuesheet(cuesheet);
      if (!r.ok) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(r, null, 2) }],
          isError: true,
        };
      }
      const current = getCuesheet(cuesheetPath);
      const diff = current.ok ? buildCuesheetDiff(current.data, r.data) : undefined;
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(diff ? { ok: true, diff } : r, null, 2) },
        ],
        isError: false,
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
