# @cuesheet/bridge

An MCP server that Claude Code connects to — when the user gives natural-language commands in
their own Claude Code (e.g. "lower the voice to 30%"), Claude Code directly edits the cuesheet
(JSON) using this server's tools. No Claude API is embedded in the app, so there's no extra cost.

## Tools

- **`get_cuesheet`** — returns the entire current cuesheet. Always call this first before
  editing, to read the latest value.
- **`update_cuesheet`** — replaces the entire cuesheet with a new value. The core of its
  flexibility — for any edit, just compute the whole new cuesheet and pass it. It's validated
  with `@cuesheet/schema`'s `validateCueSheet`, and only saved if it passes. On failure, nothing
  is saved and a list of `field-path: reason` errors is returned. `segment.crop` requires
  `crop.w === crop.h` (they must match the project's aspect ratio, assuming a same-aspect source).
- **`validate_cuesheet`** — dry-run version of `update_cuesheet`: validates a candidate cuesheet
  and returns `{ok, errors}` (or `{ok, data}`) without ever writing to disk. Use it to check an
  edit before committing it, or to see the full error list up front.
- **`get_schema`** — returns the cuesheet format as a JSON Schema (draft 2020-12), generated
  directly from the same zod schema the other three tools validate against
  (`z.toJSONSchema(cueSheetSchema)`), so it can't drift from the actual validation rules. Call
  this once at the start of a session, or whenever unsure of a field's shape/type/enum values,
  instead of guessing from examples.

Every tool's description is self-teaching (one-line when-to-use + a request/response example) —
`tools/list` alone is enough to learn the surface without reading this file.

## Registration

Registered in the root `.mcp.json`:

```json
{
  "mcpServers": {
    "cuesheet-bridge": {
      "command": "node",
      "args": ["packages/bridge/dist/index.js"],
      "env": { "CUESHEET_PATH": "project.cuesheet.json" }
    }
  }
}
```

Once Claude Code connects to the server with this config, the `get_cuesheet`/`update_cuesheet`
tools are ready to use right away.

## CUESHEET_PATH

The path to the cuesheet file being edited. Defaults to `./project.cuesheet.json` if
unspecified. The `@cuesheet/web` dev server watches the same file via `fs.watch`, so edits made
through the bridge are reflected in the web preview immediately.

## Build / typecheck / test

```bash
pnpm --filter @cuesheet/bridge build
pnpm --filter @cuesheet/bridge typecheck
pnpm --filter @cuesheet/bridge test
```
