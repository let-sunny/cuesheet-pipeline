import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { BRIDGE_TOOL_NAMES, createServer } from "../src/server.js";

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
async function connect(
  options: { readOnly?: boolean } = {},
  resolvePath: () => string = () => TMP,
): Promise<{ client: Client; close: () => Promise<void> }> {
  const server = createServer(resolvePath, options);
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
  it("tools/list exposes exactly the tools named by BRIDGE_TOOL_NAMES", async () => {
    const { client, close } = await connect();
    const { tools } = await client.listTools();
    // Guards the exported const (used by the startup banner) against drifting from what the
    // server actually registers.
    expect(tools.map((t) => t.name).sort()).toEqual([...BRIDGE_TOOL_NAMES].sort());
    await close();
  });

  it("re-resolves the cuesheet path per tool call (follows the active episode without a restart)", async () => {
    const pathA = join(tmpdir(), "cuesheet-bridge-A.json");
    const pathB = join(tmpdir(), "cuesheet-bridge-B.json");
    let active = pathA;
    const { client, close } = await connect({}, () => active);
    try {
      await client.callTool({ name: "update_cuesheet", arguments: { cuesheet: sample() } });
      expect(existsSync(pathA)).toBe(true);

      // Switch the active episode mid-session; the next call must act on B, not A.
      active = pathB;
      const sheetB = sample();
      sheetB.project.name = "episode-B";
      await client.callTool({ name: "update_cuesheet", arguments: { cuesheet: sheetB } });
      expect(existsSync(pathB)).toBe(true);

      const got = JSON.parse(textOf(await client.callTool({ name: "get_cuesheet", arguments: {} })));
      expect(got.data.project.name).toBe("episode-B");
    } finally {
      rmSync(pathA, { force: true });
      rmSync(pathB, { force: true });
      await close();
    }
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
    const savedResult = JSON.parse(textOf(saved));
    expect(savedResult.ok).toBe(true);
    expect(savedResult.receipt).toEqual({ segmentCount: 1, durationS: 5, warnings: [] });
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

  it("validate_cuesheet omits diff when there's no currently-saved cuesheet to compare against", async () => {
    const { client, close } = await connect();

    const result = await client.callTool({
      name: "validate_cuesheet",
      arguments: { cuesheet: sample() },
    });
    const parsed = JSON.parse(textOf(result));
    expect(parsed.ok).toBe(true);
    expect(parsed.diff).toBeUndefined();

    await close();
  });

  it("validate_cuesheet's diff reports segments removed and a BGM track added, against the saved cuesheet", async () => {
    const { client, close } = await connect();

    const saved = sample();
    saved.segments = [
      { clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "" },
      { clip: "b.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "" },
      { clip: "c.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "" },
    ];
    await client.callTool({ name: "update_cuesheet", arguments: { cuesheet: saved } });

    const candidate = sample();
    candidate.segments = [{ clip: "a.mp4", in: 0, out: 5, speed: 1, volume: 1, subtitle: "" }];
    candidate.bgm = [{ file: "bgm.mp3", start: 0, end: 5, volume: 0.5 }];

    const result = await client.callTool({
      name: "validate_cuesheet",
      arguments: { cuesheet: candidate },
    });
    const parsed = JSON.parse(textOf(result));
    expect(parsed.ok).toBe(true);
    expect(parsed.diff.segments.removedTotal).toBe(2);
    expect(parsed.diff.segments.addedTotal).toBe(0);
    expect(parsed.diff.bgm).toEqual({ added: 1, removed: 0, modified: 0 });

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

  it("get_schema's JSON Schema carries field-level .describe() docs (schema.ts's semantics reach the bridge, not just AGENTS.md prose)", async () => {
    const { client, close } = await connect();

    const result = await client.callTool({ name: "get_schema", arguments: {} });
    const schema = JSON.parse(textOf(result));
    const segmentProps = schema.properties.segments.items.properties;

    expect(segmentProps.clip.description).toContain("clipDir");
    expect(segmentProps.in.description).toContain("SOURCE clip");
    expect(segmentProps.speed.description).toContain("timelapse");

    await close();
  });

  it("get_capabilities returns a manifest with tools, CLIs, and schema features", async () => {
    const { client, close } = await connect();

    const result = await client.callTool({ name: "get_capabilities", arguments: {} });
    expect(result.isError).toBeFalsy();
    const manifest = JSON.parse(textOf(result));

    expect(manifest.tools.map((t: { name: string }) => t.name).sort()).toEqual([
      "get_capabilities",
      "get_cuesheet",
      "get_schema",
      "update_cuesheet",
      "validate_cuesheet",
    ]);
    expect(manifest.tools.every((t: { description: string }) => t.description.length > 0)).toBe(
      true,
    );

    expect(manifest.clis.length).toBeGreaterThan(0);
    expect(manifest.clis[0].command).toContain("cuesheet-draft");

    expect(manifest.schemaFeatures.length).toBeGreaterThan(0);
    for (const f of manifest.schemaFeatures) {
      expect(typeof f.feature).toBe("string");
      expect(typeof f.field).toBe("string");
      expect(f.description.length).toBeGreaterThan(0);
      expect(f.example.segments).toBeDefined();
    }

    await close();
  });
});

describe("bridge read-only mode (issue #12)", () => {
  it("tools/list still exposes all five tools — read-only omits writes at call time, not from registration", async () => {
    const { client, close } = await connect({ readOnly: true });
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "get_capabilities",
      "get_cuesheet",
      "get_schema",
      "update_cuesheet",
      "validate_cuesheet",
    ]);
    await close();
  });

  it("update_cuesheet refuses with a structured error and leaves the file untouched", async () => {
    const { client, close } = await connect({ readOnly: true });

    const result = await client.callTool({
      name: "update_cuesheet",
      arguments: { cuesheet: sample() },
    });
    expect(result.isError).toBe(true);
    const parsed = JSON.parse(textOf(result));
    expect(parsed.ok).toBe(false);
    expect(parsed.errors).toHaveLength(1);
    expect(parsed.errors[0]).toContain("read-only mode");
    expect(parsed.errors[0]).toContain("CUESHEET_BRIDGE_READONLY");
    expect(existsSync(TMP)).toBe(false);

    await close();
  });

  it("get_cuesheet, validate_cuesheet, and get_schema keep working in read-only mode", async () => {
    const { client, close } = await connect({ readOnly: true });

    const before = await client.callTool({ name: "get_cuesheet", arguments: {} });
    expect(before.isError).toBe(true); // file doesn't exist — read-only mode didn't cause this

    const validated = await client.callTool({
      name: "validate_cuesheet",
      arguments: { cuesheet: sample() },
    });
    expect(validated.isError).toBeFalsy();
    expect(JSON.parse(textOf(validated)).ok).toBe(true);
    expect(existsSync(TMP)).toBe(false);

    const schema = await client.callTool({ name: "get_schema", arguments: {} });
    expect(schema.isError).toBeFalsy();

    const capabilities = await client.callTool({ name: "get_capabilities", arguments: {} });
    expect(capabilities.isError).toBeFalsy();

    await close();
  });

  it("read-only mode off (default) behaves exactly as before — update_cuesheet writes normally", async () => {
    const { client, close } = await connect();

    const result = await client.callTool({
      name: "update_cuesheet",
      arguments: { cuesheet: sample() },
    });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(textOf(result)).ok).toBe(true);
    expect(existsSync(TMP)).toBe(true);

    await close();
  });
});
