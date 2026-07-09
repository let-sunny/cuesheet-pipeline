# AGENTS.md

This file is for an AI agent **operating** this tool on a user's behalf (running the pipeline,
editing a cuesheet, rendering output). It is not about developing this repo — for that, see
[CLAUDE.md](./CLAUDE.md) (repo conventions, package architecture, contribution rules). If
you're implementing a feature or fixing a bug in this codebase, read CLAUDE.md instead.

## What this is

A cuesheet-driven pipeline that turns a folder of dialogue-free raw footage into a rendered
video. A vision model (Claude, reading extracted frames — there is no audio transcript to work
from) proposes which moments are worth using; a deterministic assemble step turns those
judgments into a validated cuesheet (JSON); a human or an agent edits that cuesheet (by hand in
a browser editor, or via natural-language commands through the MCP bridge below); and a
local-ffmpeg render step turns the cuesheet into a final `.mp4` (and optionally `.srt`). The
cuesheet file is the single source of truth every step reads from or writes to — nothing
downstream ever reads anything else.

## The cuesheet contract, in brief

- Schema lives in `packages/schema/src/schema.ts` (zod). Every other package imports types via
  `@cuesheet/schema`, never redefines them — `z.infer`/`z.input` are the only source of `CueSheet`/
  `CueSheetInput` types.
- Validate any candidate cuesheet with `validateCueSheet(data)` (returns `{ok:true, data}` or
  `{ok:false, errors: string[]}`).
- Every validation error string is `fieldpath: reason`, e.g. `segments[0].in: in must be less
  than out`. This format is consistent across the schema, both CLIs, the MCP bridge, and the
  web app's save endpoint — parse it the same way regardless of which layer produced it.
- Units are seconds everywhere in the cuesheet (never frames); only `@cuesheet/render` converts
  to frames, using `project.fps`.
- `segment.clip` is a filename only — the folder is the separate `clipDir` field, so moving the
  footage folder doesn't invalidate every segment.
- Beyond the basic trim/subtitle/speed/volume fields, the schema also covers: per-cut title cards
  (`segment.title` — text/preset/durationS/backdrop dim, presets `gooey`/`melt`/`particle`/`typing`),
  per-cut fade/dip transitions (`segment.transitionIn`/`transitionOut`), episode-level fade in/out
  (`project.fadeInS`/`fadeOutS`), named reusable subtitle style presets (`subtitleStylePresets` +
  `segment.stylePreset` to opt a cut into one), and BGM ducking under narration
  (`narration.ducking` — amount/fadeS). All optional/omitted-means-off, so existing cuesheets
  keep validating and rendering identically.
- To see the full contract as JSON Schema instead of reading zod source, call the MCP bridge's
  `get_schema` tool (see below) — it's generated directly from the same zod schema, so it can't
  drift from what actually validates.

## CLI surface

All commands below assume `pnpm install` has been run and (for the two package CLIs) that
package is built (`pnpm --filter @cuesheet/draft build`, `pnpm --filter @cuesheet/render build`
— or `pnpm -r build` for everything). Exact invocations, copy-pasteable:

### End-to-end for one raw footage folder

```bash
pnpm episode "<raw footage folder>"              # scan + boots the web editor
pnpm episode "<raw footage folder>" --scan-only  # scan only, no editor/browser
pnpm episode "<raw footage folder>" --no-open    # scan + editor, don't auto-open the browser
pnpm episode "<raw footage folder>" --rescan     # re-run scan even if manifest.json exists
```

Then, in Claude Code: `/episode <raw footage folder>` — runs the full vision-judgment +
assemble + subtitle-voice pass documented in `.claude/commands/episode.md`. That command owns
the orchestration; nothing else needs to be run by hand for a first rough cut.

### `cuesheet-draft` (scan / assemble — the rough-cut pipeline's deterministic half)

```bash
cuesheet-draft scan <source-folder> --out <work-folder> [--json]
# -> <work-folder>/manifest.json, <work-folder>/frames/<clip-name>/*.jpg

cuesheet-draft assemble \
  --manifest <work-folder>/manifest.json \
  --moments <work-folder>/moments.json \
  --clip-dir <source-folder> \
  --project-name "<name>" \
  --out <cuesheet-path>.json \
  [--fps 30] [--width 1280] [--height 720] [--boundary-pad 0.4] [--config <path.json>] [--json]
```

`moments.json` is the one vision-judgment artifact in the whole pipeline — an agent writes it by
looking at the frames scan just extracted (schema: `momentsFileSchema` from `@cuesheet/draft`,
documented in `.claude/commands/episode.md` and `packages/draft/README.md`). `--config` takes a
partial `AssembleGrammarConfig` override (cut rhythm, quality threshold, timelapse-connector
rules, face-heuristic word lists, boundary pad) deep-merged onto the defaults — omit it to use
the defaults as-is.

`--json` (either subcommand): emits one structured result object to stdout on success —
`scan` -> `{clips, evicted, frames, manifestPath}`, `assemble` -> `{segments, durationS,
connectors, validationOk, outPath}`. Human-readable progress/errors go to stderr regardless of
`--json`, so stdout stays parseable by a script either way. On failure, both subcommands print
`fieldpath: reason` lines to stderr and exit 1 (no stdout JSON is emitted for the error case).

### `cuesheet-render` (cuesheet -> final video/subtitles)

```bash
cuesheet-render [cuesheet.json] [output.mp4] [--no-subtitles] [--srt <path>] [--json]
# defaults: project.cuesheet.json -> out.mp4, subtitle burn-in on
```

`--no-subtitles`: clean video with no burned-in drawtext (pair with the `--srt` output for a
separate CC track). `--srt <path>`: also writes an SRT built from the same cuesheet. `--json`:
on success, emits `{outputPath, durationS, srtPath}` to stdout (`durationS` is ffprobed from the
actual rendered file; `srtPath` is `null` unless `--srt` was passed) — same stdout/stderr split
as `cuesheet-draft` above. Requires ffmpeg on `PATH`; for cuesheets with subtitles, macOS's
Homebrew default `ffmpeg` is missing `drawtext` (no libfreetype/fontconfig) — install
`ffmpeg-full` instead (see `packages/render/README.md`).

## MCP bridge (Claude Code editing the cuesheet by natural language)

The user's own Claude Code session (a *different* session from the one operating this repo, or
the same one) attaches to `cuesheet-bridge` and edits the cuesheet in place — no Claude API call
happens inside the app itself. Registered in the root `.mcp.json`, which points at
`packages/bridge/dist/index.js` — **that file only exists after a build** (`pnpm --filter
@cuesheet/bridge build`, or `pnpm -r build` for everything), so run one of those once before a
Claude Code session tries to attach to `cuesheet-bridge`, or the server fails to start:

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

Tools (each tool's own description is self-teaching — call `tools/list` and you don't need this
table — but as a quick reference):

| Tool | When to use |
|---|---|
| `get_cuesheet` | Always call first, to read the current value before editing. |
| `update_cuesheet` | Once you've computed the whole new cuesheet for an edit (volume, trim, subtitle, order, crop, etc.) and are ready to save. Validates before writing; nothing is saved on failure. |
| `validate_cuesheet` | Dry-run check of a candidate cuesheet — never writes to disk. Use before committing an edit, or to see all errors at once. |
| `get_schema` | Once per session, or whenever unsure of a field's shape/type/enum values, instead of guessing from examples. Returns the cuesheet format as JSON Schema. |

Every edit is "read the whole cuesheet, compute the whole new cuesheet, send it back" —
`update_cuesheet`/`validate_cuesheet` never take a partial patch. `CUESHEET_PATH` (env var,
defaults to `./project.cuesheet.json`) selects which file is being edited; the web editor
watches the same file and refreshes automatically when the bridge writes to it.

## Web editor HTTP endpoints (agent-callable)

The web editor's dev server (`pnpm --filter @cuesheet/web dev`, default `localhost:5173`) exposes
a few plain HTTP endpoints worth knowing about directly, beyond the cuesheet-bridge MCP tools
above:

- `GET /api/frame-capture?clip=<filename>&atS=<source-seconds>` — captures one full-resolution
  PNG frame straight from the original clip (seek-based ffmpeg, not the 720p preview proxy) at
  `atS` seconds into that clip. Useful for pulling a thumbnail candidate for a specific moment
  without opening the browser.
- `GET /api/bgm-files` — lists audio files usable as background music, recursively under repo
  `media/` plus the current cuesheet's `clipDir`, each with a probed `durationS`.
- `POST /api/render` runs the same render the Export step's button triggers. The output file
  lands at `out/<project-name>.mp4` (repo-root `out/` directory, filename sanitized from
  `project.name`) — **not** `out.mp4` at the repo root. That bare `out.mp4` name is only the
  `cuesheet-render` CLI's own default output argument (see CLI surface above); the two are
  independent paths that happen to share a directory choice by convention, not the same file.

## File/path conventions

- `episodes/<slug>.cuesheet.json` — the per-episode cuesheet naming convention used by
  `pnpm episode` (`<slug>` = the source folder's basename, slugified). This is where a
  multi-episode workflow's cuesheets live.
- `project.cuesheet.json` (repo root) — the default single-project cuesheet the MCP bridge and
  ad hoc CLI runs use unless `CUESHEET_PATH` says otherwise.
- `media/drafts/<slug>/` — scan/assemble working artifacts (`manifest.json`, extracted frames,
  `moments.json`, `progress.json`). **Gitignored** — personal raw-footage-derived data, never
  committed.
- `clipDir` (a field inside the cuesheet, e.g. `media/clips`) — the folder actual video clips
  live in. Cuesheets store clip filenames only (`segment.clip`); `clipDir` is what makes moving
  the footage folder not break every segment. Keep it repo-relative (or otherwise resolvable
  from wherever the cuesheet is being read) rather than an absolute path tied to one machine.
- Rendered/generated outputs (`out.mp4`, `out/*.mp4`, `*.srt`, `proto_*.mp4`, proxies,
  thumbnails) are **never committed** — see `.gitignore`. Don't `git add` anything under
  `media/proxies/`, `media/.thumbs/`, `out/`, or a render's output path.

## Typical workflows

**New episode, end to end**: `pnpm episode "<folder>"` (scans, boots the editor) -> in Claude
Code, `/episode <folder>` (vision judgment -> assemble -> subtitle voice pass) -> open
`http://localhost:5173`, review the rough cut, hand-edit anything -> press render in the editor
(lands at `out/<project-name>.mp4`) (or run `cuesheet-render episodes/<slug>.cuesheet.json
out.mp4`).

**Bulk subtitle edit via MCP**: connect to `cuesheet-bridge`, call `get_cuesheet`, compute a new
`segments` array with every `subtitle` rewritten (e.g. tone pass per `docs/voice-guide.md`),
call `update_cuesheet` with the whole object. If unsure a rewrite will validate (e.g. you're not
sure every field survived), call `validate_cuesheet` first.

**Export**: from the web editor's Export step (burn-in toggle, SRT download), or directly via
`cuesheet-render <cuesheet.json> <out.mp4> --srt <out.srt>`. Use `--json` if a script needs to
consume the result programmatically instead of a human reading stderr.
