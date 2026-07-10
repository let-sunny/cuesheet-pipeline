import { z } from "zod";
import { describe, expect, it } from "vitest";
import { cueSheetSchema } from "../src/index.js";

type JsonSchemaNode = Record<string, unknown>;

const jsonSchema = z.toJSONSchema(cueSheetSchema) as JsonSchemaNode;

/**
 * Walks every object property / array item / record value in the generated JSON Schema and
 * collects the dotted paths of any that are missing a non-empty `description`. Self-enforcing:
 * a new field added to the schema without `.describe()` fails this test instead of silently
 * shipping an undocumented `get_schema` response (packages/bridge/src/store.ts's
 * `getCuesheetJsonSchema`).
 */
function collectMissingDescriptions(node: unknown, path: string, missing: string[]): void {
  if (!node || typeof node !== "object") return;
  const obj = node as JsonSchemaNode;

  const properties = obj.properties as Record<string, JsonSchemaNode> | undefined;
  if (properties) {
    for (const [key, propSchema] of Object.entries(properties)) {
      const propPath = path ? `${path}.${key}` : key;
      if (typeof propSchema.description !== "string" || propSchema.description.length === 0) {
        missing.push(propPath);
      }
      collectMissingDescriptions(propSchema, propPath, missing);
    }
  }

  const items = obj.items as JsonSchemaNode | undefined;
  if (items) collectMissingDescriptions(items, `${path}[]`, missing);

  const additionalProperties = obj.additionalProperties;
  if (additionalProperties && typeof additionalProperties === "object") {
    collectMissingDescriptions(additionalProperties, `${path}{}`, missing);
  }
}

describe("cueSheetSchema JSON Schema descriptions", () => {
  it("every property in the generated JSON Schema carries a non-empty description", () => {
    const missing: string[] = [];
    collectMissingDescriptions(jsonSchema, "", missing);
    expect(missing).toEqual([]);
  });

  it("states in/out are source-clip seconds, not output-timeline seconds", () => {
    const segmentIn = (
      (
        (jsonSchema.properties as JsonSchemaNode).segments as JsonSchemaNode
      ).items as JsonSchemaNode
    ).properties as JsonSchemaNode;
    expect(segmentIn.in).toMatchObject({
      description: expect.stringContaining("SOURCE clip"),
    });
  });

  it("states segment.clip is filename-only, resolved against clipDir", () => {
    const segmentProps = (
      ((jsonSchema.properties as JsonSchemaNode).segments as JsonSchemaNode).items as JsonSchemaNode
    ).properties as JsonSchemaNode;
    expect(segmentProps.clip).toMatchObject({
      description: expect.stringContaining("clipDir"),
    });
  });

  it("states speed >= 8 reads as a timelapse cut and the 16 cap's reason", () => {
    const segmentProps = (
      ((jsonSchema.properties as JsonSchemaNode).segments as JsonSchemaNode).items as JsonSchemaNode
    ).properties as JsonSchemaNode;
    const speedDescription = (segmentProps.speed as JsonSchemaNode).description as string;
    expect(speedDescription).toContain("timelapse");
    expect(speedDescription).toContain("16");
  });

  it("states bgm.file is a usable path directly, unlike segment.clip's filename-only convention", () => {
    const bgmProps = (
      ((jsonSchema.properties as JsonSchemaNode).bgm as JsonSchemaNode).items as JsonSchemaNode
    ).properties as JsonSchemaNode;
    expect(bgmProps.file).toMatchObject({
      description: expect.stringContaining("NOT filename-only"),
    });
  });

  it("states subtitleStylePresets merge order (global < preset < per-cut override)", () => {
    const subtitleStylePresets = (jsonSchema.properties as JsonSchemaNode)
      .subtitleStylePresets as JsonSchemaNode;
    expect(subtitleStylePresets.description).toContain("subtitleStyle <");
  });
});
