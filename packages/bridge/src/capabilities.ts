import type { CueSheetInput } from "@cuesheet/schema";
import { duckingSchema, projectSchema, segmentSchema, subtitleStyleSchema, subtitleStylePresetsSchema } from "@cuesheet/schema";

/** One bridge tool, as already registered on the server (name + its own registered description). */
export interface CapabilityTool {
  name: string;
  description: string;
}

/** One CLI entry point. Full contract lives in AGENTS.md; --json envelope shape is pinned by the referenced test. */
export interface CapabilityCli {
  command: string;
  jsonFlag: boolean;
  reference: string;
}

/** One expressive cuesheet feature: what field(s) express it, its own schema description, and a minimal working example. */
export interface CapabilitySchemaFeature {
  feature: string;
  field: string;
  description: string;
  example: CueSheetInput;
}

export interface Capabilities {
  tools: CapabilityTool[];
  clis: CapabilityCli[];
  schemaFeatures: CapabilitySchemaFeature[];
}

/**
 * Builds the capability manifest (issue #13) — the discovery surface answering "what can an
 * AI do with this system": bridge tools, CLI entry points, and cuesheet schema features, each
 * with a one-line description and (for schema features) a minimal valid example.
 *
 * Single-source by construction, not by convention:
 * - `tools` is passed in by the caller (server.ts) as the *already-registered* tools' own
 *   `{name, description}` — the exact same description string `registerTool` was given, read
 *   back rather than retyped, so this can't drift from the real tool descriptions.
 * - `clis` only references AGENTS.md's CLI surface section and each CLI's own envelope-pinning
 *   test, rather than restating their prose.
 * - `schemaFeatures[].description` is read directly off the same zod schema objects
 *   `get_schema` serves (`schema.shape.field.description`), never hand-copied text — a
 *   `.describe()` edit in `packages/schema/src/schema.ts` is reflected here automatically.
 *   `schemaFeatures[].example` is the one hand-authored part (zod can't invent a realistic
 *   cuesheet snippet); `capabilities.test.ts` validates every example with `validateCueSheet`
 *   so a schema change that breaks one is caught in CI, not discovered by an agent at runtime.
 */
export function buildCapabilities(tools: CapabilityTool[]): Capabilities {
  return { tools, clis: CLI_ENTRIES, schemaFeatures: SCHEMA_FEATURES };
}

const CLI_ENTRIES: CapabilityCli[] = [
  {
    command: "cuesheet-draft scan <source-folder> --out <work-folder>",
    jsonFlag: true,
    reference: "AGENTS.md#cli-surface; packages/draft/test/cli.test.ts",
  },
  {
    command:
      "cuesheet-draft assemble --manifest <manifest.json> --moments <moments.json> --clip-dir <dir> --project-name <name> --out <cuesheet.json>",
    jsonFlag: true,
    reference: "AGENTS.md#cli-surface; packages/draft/test/cli.test.ts",
  },
  {
    command: "cuesheet-render [cuesheet.json] [output.mp4] [--no-subtitles] [--srt <path>]",
    jsonFlag: true,
    reference: "AGENTS.md#cli-surface; packages/render/test/cli.test.ts",
  },
];

/** Minimal valid base cuesheet every schema-feature example is layered on top of. */
const BASE_EXAMPLE: CueSheetInput = {
  project: { name: "capability-example", fps: 30, width: 1920, height: 1080 },
  clipDir: "media/clips",
  intro: null,
  outro: null,
  segments: [{ clip: "a.mp4", in: 0, out: 5, subtitle: "" }],
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

const SCHEMA_FEATURES: CapabilitySchemaFeature[] = [
  {
    feature: "title cards",
    field: "segments[].title",
    description: segmentSchema.shape.title.description ?? "",
    example: {
      ...BASE_EXAMPLE,
      segments: [
        {
          ...BASE_EXAMPLE.segments[0]!,
          title: { text: "Chapter 1", preset: "fade", durationS: 3 },
        },
      ],
    },
  },
  {
    feature: "fade/dip transitions",
    field: "segments[].transitionIn / segments[].transitionOut",
    description: segmentSchema.shape.transitionIn.description ?? "",
    example: {
      ...BASE_EXAMPLE,
      segments: [
        {
          ...BASE_EXAMPLE.segments[0]!,
          transitionIn: { type: "fade", durationS: 0.5 },
          transitionOut: { type: "dip", durationS: 0.5, dim: 0.6 },
        },
      ],
    },
  },
  {
    feature: "episode-level fade in/out",
    field: "project.fadeInS / project.fadeOutS",
    description: projectSchema.shape.fadeInS.description ?? "",
    example: {
      ...BASE_EXAMPLE,
      project: { ...BASE_EXAMPLE.project, fadeInS: 1, fadeOutS: 1 },
    },
  },
  {
    feature: "subtitle style presets",
    field: "subtitleStylePresets + segments[].stylePreset",
    description: subtitleStylePresetsSchema.description ?? "",
    example: {
      ...BASE_EXAMPLE,
      subtitleStylePresets: { "inner-voice": { color: "#cccccc", size: 36 } },
      segments: [{ ...BASE_EXAMPLE.segments[0]!, stylePreset: "inner-voice" }],
    },
  },
  {
    feature: "BGM ducking under narration",
    field: "narration.ducking",
    description: duckingSchema.description ?? "",
    example: {
      ...BASE_EXAMPLE,
      segments: [{ ...BASE_EXAMPLE.segments[0]!, narration: "line-01.mp3" }],
      narration: { enabled: true, dir: "media/narration", ducking: { amount: 0.6, fadeS: 0.3 } },
    },
  },
  {
    feature: "timelapse speed",
    field: "segments[].speed",
    description: segmentSchema.shape.speed.description ?? "",
    example: {
      ...BASE_EXAMPLE,
      segments: [{ ...BASE_EXAMPLE.segments[0]!, speed: 14 }],
    },
  },
  {
    feature: "per-segment crop",
    field: "segments[].crop",
    description: segmentSchema.shape.crop.description ?? "",
    example: {
      ...BASE_EXAMPLE,
      segments: [{ ...BASE_EXAMPLE.segments[0]!, crop: { x: 0, y: 0.25, w: 0.75, h: 0.75 } }],
    },
  },
  {
    feature: "subtitle background box",
    field: "subtitleStyle.background",
    description: subtitleStyleSchema.shape.background.description ?? "",
    example: {
      ...BASE_EXAMPLE,
      subtitleStyle: {
        ...BASE_EXAMPLE.subtitleStyle,
        background: { color: "#000000", opacity: 0.5, padding: 8 },
      },
    },
  },
];
