import { segmentSchema, validateCueSheet } from "@cuesheet/schema";
import { describe, expect, it } from "vitest";
import { buildCapabilities, type CapabilityTool } from "../src/capabilities.js";

const tools: CapabilityTool[] = [
  { name: "get_cuesheet", description: "d1" },
  { name: "update_cuesheet", description: "d2" },
];

describe("buildCapabilities", () => {
  it("passes the given tools through unchanged", () => {
    const manifest = buildCapabilities(tools);
    expect(manifest.tools).toEqual(tools);
  });

  it("lists at least one CLI entry point referencing AGENTS.md", () => {
    const manifest = buildCapabilities(tools);
    expect(manifest.clis.length).toBeGreaterThan(0);
    for (const cli of manifest.clis) {
      expect(cli.command.length).toBeGreaterThan(0);
      expect(cli.reference).toContain("AGENTS.md");
    }
  });

  it("every schema feature's description matches the live schema's own .describe() text", () => {
    const manifest = buildCapabilities(tools);
    const bySchemaField: Record<string, string | undefined> = {
      "segments[].title": segmentSchema.shape.title.description,
      "segments[].transitionIn / segments[].transitionOut": segmentSchema.shape.transitionIn.description,
      "segments[].speed": segmentSchema.shape.speed.description,
      "segments[].crop": segmentSchema.shape.crop.description,
    };
    for (const feature of manifest.schemaFeatures) {
      const expected = bySchemaField[feature.field];
      if (expected !== undefined) {
        expect(feature.description).toBe(expected);
      }
      expect(feature.description.length).toBeGreaterThan(0);
    }
  });

  it("every schema feature's example is a valid cuesheet (catches drift from schema changes)", () => {
    const manifest = buildCapabilities(tools);
    for (const feature of manifest.schemaFeatures) {
      const result = validateCueSheet(feature.example);
      expect(result.ok, `feature "${feature.feature}" example failed: ${!result.ok ? result.errors.join(", ") : ""}`).toBe(
        true,
      );
    }
  });

  it("covers the features named in issue #13 (title, transitions, ducking, style presets, timelapse speed)", () => {
    const manifest = buildCapabilities(tools);
    const featureNames = manifest.schemaFeatures.map((f) => f.feature);
    expect(featureNames).toEqual(
      expect.arrayContaining([
        "title cards",
        "fade/dip transitions",
        "BGM ducking under narration",
        "subtitle style presets",
        "timelapse speed",
      ]),
    );
  });
});
