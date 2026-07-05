#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getCuesheet, updateCuesheet } from "./store.js";

/**
 * Claude Code가 붙는 MCP 브리지.
 * 사용자가 자기 Claude Code에서 자연어로 명령하면, Claude Code가 이 툴들로
 * 큐시트를 편집한다. 별도 Claude API 호출 없음(추가 비용 없음).
 *
 * 편집 대상 큐시트 파일은 CUESHEET_PATH 환경변수로 지정(기본 ./project.cuesheet.json).
 * 웹앱은 이 파일을 감시해 미리보기를 갱신한다.
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
