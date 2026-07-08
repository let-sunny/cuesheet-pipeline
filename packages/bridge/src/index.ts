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
    description: "현재 큐시트(JSON)를 반환한다. 편집하기 전에 항상 먼저 읽어라.",
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
      "큐시트 전체를 새 값으로 교체한다. 스키마로 검증되며 통과해야만 저장된다. " +
      "어떤 편집이든(볼륨·트림·자막·순서 등) 새 큐시트를 통째로 계산해서 넘겨라. " +
      "먼저 get_cuesheet로 현재 값을 읽고, 필요한 부분만 바꾼 전체 객체를 보내면 된다.",
    inputSchema: { cuesheet: z.record(z.string(), z.unknown()) },
  },
  async ({ cuesheet }) => {
    const r = updateCuesheet(CUESHEET_PATH, cuesheet);
    return {
      content: [
        {
          type: "text" as const,
          text: r.ok ? "저장 완료" : `검증 실패 — 저장하지 않음:\n${r.errors.join("\n")}`,
        },
      ],
      isError: !r.ok,
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
