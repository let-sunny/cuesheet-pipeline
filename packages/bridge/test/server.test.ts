import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "../src/server.js";

const TMP = join(tmpdir(), "cuesheet-bridge-server-test.json");

function sample() {
  return {
    project: { name: "t", fps: 30, width: 1920, height: 1080 },
    clipDir: "/x/clips",
    intro: null,
    outro: null,
    segments: [{ clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "" }],
    bgm: [],
    subtitleStyle: {
      font: "Pretendard",
      size: 48,
      color: "#ffffff",
      outlineColor: "#000000",
      outlineWidth: 3,
      position: "bottom",
    },
  };
}

/** Connects a fresh Client<->Server pair over an in-memory transport (full initialize handshake). */
async function connect(): Promise<{ client: Client; close: () => Promise<void> }> {
  const server = createServer(TMP);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

function textOf(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const first = (result.content as Array<{ type: string; text?: string }>)[0];
  if (!first || first.type !== "text" || typeof first.text !== "string") {
    throw new Error(`Unexpected tool result content: ${JSON.stringify(result.content)}`);
  }
  return first.text;
}

afterEach(() => {
  if (existsSync(TMP)) rmSync(TMP);
});

describe("bridge MCP round-trip", () => {
  it("tools/list exposes all four tools", async () => {
    const { client, close } = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "get_cuesheet",
      "get_schema",
      "update_cuesheet",
      "validate_cuesheet",
    ]);
    await close();
  });

  it("get_cuesheet -> update_cuesheet -> get_cuesheet round-trips a value", async () => {
    const { client, close } = await connect();

    const before = await client.callTool({ name: "get_cuesheet", arguments: {} });
    expect(before.isError).toBe(true); // file doesn't exist yet

    const saved = await client.callTool({
      name: "update_cuesheet",
      arguments: { cuesheet: sample() },
    });
    expect(saved.isError).toBeFalsy();
    expect(textOf(saved)).toBe("Saved");
    expect(existsSync(TMP)).toBe(true);

    const after = await client.callTool({ name: "get_cuesheet", arguments: {} });
    expect(after.isError).toBeFalsy();
    const parsed = JSON.parse(textOf(after));
    expect(parsed.ok).toBe(true);
    expect(parsed.data.segments[0].clip).toBe("a.mp4");

    await close();
  });

  it("validate_cuesheet is a dry run — never writes to disk", async () => {
    const { client, close } = await connect();

    const ok = await client.callTool({
      name: "validate_cuesheet",
      arguments: { cuesheet: sample() },
    });
    expect(ok.isError).toBeFalsy();
    expect(JSON.parse(textOf(ok)).ok).toBe(true);
    expect(existsSync(TMP)).toBe(false);

    const bad = sample();
    bad.segments[0].out = -1; // in >= out
    const failed = await client.callTool({
      name: "validate_cuesheet",
      arguments: { cuesheet: bad },
    });
    expect(failed.isError).toBe(true);
    const failedResult = JSON.parse(textOf(failed));
    expect(failedResult.ok).toBe(false);
    expect(failedResult.errors.some((e: string) => e.includes("segments[0].out"))).toBe(true);
    expect(existsSync(TMP)).toBe(false);

    await close();
  });

  it("get_schema returns a JSON Schema describing the cuesheet contract", async () => {
    const { client, close } = await connect();

    const result = await client.callTool({ name: "get_schema", arguments: {} });
    expect(result.isError).toBeFalsy();
    const schema = JSON.parse(textOf(result));
    expect(schema.type).toBe("object");
    expect(schema.properties.project).toBeDefined();
    expect(schema.properties.segments).toBeDefined();

    await close();
  });
});
