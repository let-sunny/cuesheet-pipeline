import { describe, expect, it } from "vitest";
import {
  extractBridgeToolNames,
  extractCommandFlags,
  extractEnvVarNames,
  extractHttpEndpoints,
  isFlagReferencedInSource,
} from "../lib/agents-doc-matcher.mjs";

describe("extractCommandFlags", () => {
  it("collects flags from a single-line invocation", () => {
    const md = "```bash\ncuesheet-render [cuesheet.json] [output.mp4] [--no-subtitles] [--srt <path>] [--json]\n# defaults\n```";
    expect(extractCommandFlags(md, "cuesheet-render")).toEqual(
      new Set(["--no-subtitles", "--srt", "--json"]),
    );
  });

  it("collects flags across backslash-continued lines, stopping at the next unindented line", () => {
    const md = [
      "```bash",
      "cuesheet-draft scan <source-folder> --out <work-folder> [--json]",
      "# -> <work-folder>/manifest.json",
      "",
      "cuesheet-draft assemble \\",
      "  --manifest <path> \\",
      "  --moments <path> \\",
      "  --clip-dir <dir> \\",
      "  --out <out>.json \\",
      "  [--boundary-pad 0.4] [--config <path.json>] [--json]",
      "```",
    ].join("\n");

    expect(extractCommandFlags(md, "cuesheet-draft scan")).toEqual(new Set(["--out", "--json"]));
    expect(extractCommandFlags(md, "cuesheet-draft assemble")).toEqual(
      new Set(["--manifest", "--moments", "--clip-dir", "--out", "--boundary-pad", "--config", "--json"]),
    );
  });

  it("accumulates flags across repeated invocations of the same command", () => {
    const md = [
      "```bash",
      'pnpm episode "<folder>"              # scan + boot',
      'pnpm episode "<folder>" --scan-only  # scan only',
      'pnpm episode "<folder>" --no-open    # no browser',
      'pnpm episode "<folder>" --rescan     # re-scan',
      "```",
    ].join("\n");

    expect(extractCommandFlags(md, "pnpm episode")).toEqual(
      new Set(["--scan-only", "--no-open", "--rescan"]),
    );
  });

  it("returns an empty set when the command never appears", () => {
    const md = "```bash\nsome-other-command --flag\n```";
    expect(extractCommandFlags(md, "cuesheet-render")).toEqual(new Set());
  });
});

describe("extractBridgeToolNames", () => {
  it("reads tool names from the bridge table's first column", () => {
    const md = [
      "| Tool | When to use |",
      "|---|---|",
      "| `get_cuesheet` | Always call first. |",
      "| `update_cuesheet` | Once ready to save. |",
      "",
      "Some prose mentioning `get_cuesheet` again should not double count.",
    ].join("\n");

    expect(extractBridgeToolNames(md)).toEqual(["get_cuesheet", "update_cuesheet"]);
  });

  it("ignores non-table backtick spans", () => {
    const md = "Call `get_cuesheet` before `update_cuesheet`.";
    expect(extractBridgeToolNames(md)).toEqual([]);
  });
});

describe("extractHttpEndpoints", () => {
  it("extracts method + path, stripping query strings and trailing prose in the same span", () => {
    const md = [
      "- `GET /api/frame-capture?clip=<filename>&atS=<source-seconds>` — captures a frame.",
      "- `GET /api/bgm-files` — lists audio files.",
      "- `POST /api/render` runs the render.",
    ].join("\n");

    expect(extractHttpEndpoints(md)).toEqual([
      "GET /api/frame-capture",
      "GET /api/bgm-files",
      "POST /api/render",
    ]);
  });

  it("dedupes an endpoint mentioned more than once", () => {
    const md = "`GET /out.mp4` is stable. Downloadable via `GET /out.mp4` too.";
    expect(extractHttpEndpoints(md)).toEqual(["GET /out.mp4"]);
  });
});

describe("extractEnvVarNames", () => {
  it("extracts CUESHEET_-prefixed env vars, stripping an inline =value", () => {
    const md = "`CUESHEET_PATH` (env var). Setting `CUESHEET_BRIDGE_READONLY=1` enables read-only mode.";
    expect(extractEnvVarNames(md)).toEqual(["CUESHEET_PATH", "CUESHEET_BRIDGE_READONLY"]);
  });

  it("ignores unrelated all-caps backtick spans (e.g. the OS PATH var)", () => {
    const md = "Requires ffmpeg on `PATH`.";
    expect(extractEnvVarNames(md)).toEqual([]);
  });

  it("dedupes repeats", () => {
    const md = "`CUESHEET_PATH` ... later, `CUESHEET_PATH` again.";
    expect(extractEnvVarNames(md)).toEqual(["CUESHEET_PATH"]);
  });
});

describe("isFlagReferencedInSource", () => {
  it("matches a literal dashed flag (args.includes convention)", () => {
    expect(isFlagReferencedInSource("--no-subtitles", 'args.includes("--no-subtitles")')).toBe(true);
  });

  it("matches a quoted stripped key with internal dashes (flags[...] convention)", () => {
    expect(isFlagReferencedInSource("--boundary-pad", 'flags["boundary-pad"]')).toBe(true);
  });

  it("matches dot access for a stripped key with no internal dashes (flags.foo convention)", () => {
    expect(isFlagReferencedInSource("--config", "flags.config ? ... : undefined")).toBe(true);
  });

  it("returns false when the flag is not referenced anywhere", () => {
    expect(isFlagReferencedInSource("--boundary-pad", 'flags.config; flags["clip-dir"]')).toBe(false);
  });
});
