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

- Schema lives in `packages/schema/src/schema.ts` (zod), the single source of `CueSheet` types.
  Validate any candidate with `validateCueSheet(data)` -> `{ok:true, data}` or `{ok:false,
  errors: string[]}`.
- Every validation error is `fieldpath: reason` (e.g. `segments[0].in: in must be less than
  out`), consistent across the schema, both CLIs, the bridge, and the web save endpoint — parse
  it the same way regardless of which layer produced it. A mechanically-fixable error carries an
  additional ` — <hint>` suffix (e.g. `... — clamp to 16`); match on the `fieldpath: reason`
  prefix, since the hint is a suggestion only (see `packages/schema/src/hints.ts`).
- Units are seconds everywhere (never frames) — only `@cuesheet/render` converts, via
  `project.fps`. `segment.clip` is a filename only; the folder is the separate `clipDir` field.
- For what the schema expresses beyond basic trim/subtitle/speed/volume (title cards,
  transitions, fades, subtitle style presets, BGM ducking, crop, etc.), don't reconstruct the
  list by reading source — call the bridge's `get_capabilities` (one-line-per-feature + a
  minimal snippet each) or `get_schema` (the full JSON Schema, generated live so it can't drift).

## CLI surface

Assumes `pnpm install` and a build (`pnpm -r build`, or `pnpm --filter @cuesheet/draft build` /
`--filter @cuesheet/render build` individually).

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

`moments.json` is the one vision-judgment artifact in the pipeline — an agent writes it by
looking at the frames scan just extracted (schema: `momentsFileSchema` from `@cuesheet/draft`,
documented in `.claude/commands/episode.md` and `packages/draft/README.md`). On failure, both
subcommands print `fieldpath: reason` to stderr and exit 1. For the exact `--json` envelope
shape, call `get_capabilities` (its `clis` entry points at the pinning test) rather than reading
it here.

### `cuesheet-render` (cuesheet -> final video/subtitles)

```bash
cuesheet-render [cuesheet.json] [output.mp4] [--no-subtitles] [--srt <path>] [--json]
# defaults: project.cuesheet.json -> out.mp4, subtitle burn-in on
```

`--no-subtitles`: clean video, no burned-in drawtext (pair with `--srt` for a separate CC
track). Requires ffmpeg on `PATH`; for cuesheets with subtitles, macOS's Homebrew default
`ffmpeg` is missing `drawtext` — install `ffmpeg-full` instead (see `packages/render/README.md`).

## MCP bridge (Claude Code editing the cuesheet by natural language)

The user's own Claude Code session (a *different* session from the one operating this repo, or
the same one) attaches to `cuesheet-bridge` and edits the cuesheet in place — no Claude API call
happens inside the app itself. Registered in the root `.mcp.json`, which points at
`packages/bridge/dist/index.js` — **that file only exists after a build** (`pnpm --filter
@cuesheet/bridge build`, or `pnpm -r build`), so run one of those once before a Claude Code
session tries to attach, or the server fails to start.

Every tool's own description is self-teaching — call `tools/list` and you don't need more than
this table:

| Tool | When to use |
|---|---|
| `get_cuesheet` | Always call first, to read the current value before editing. |
| `update_cuesheet` | Once you've computed the whole new cuesheet for an edit and are ready to save. Validates before writing; nothing is saved on failure. Success returns a receipt (`segmentCount`, `durationS`, `warnings`) computed from what was actually written, so no follow-up `get_cuesheet` is needed to confirm the edit landed. |
| `validate_cuesheet` | Dry-run check of a candidate cuesheet — never writes to disk. Success also returns a `diff` against the currently-saved cuesheet (segments/project/bgm/narration changes), so you can preview an edit before calling `update_cuesheet` with it. |
| `get_schema` | Once per session, or whenever unsure of a field's shape/type/enum, instead of guessing from examples. Returns the cuesheet format as JSON Schema. |
| `get_capabilities` | Once per session, or whenever exploring what this system can do. Returns `{tools, clis, schemaFeatures}` generated live from the schema and the tool/CLI registrations themselves — nothing here to go stale. |

Every edit is "read the whole cuesheet, compute the whole new cuesheet, send it back" —
`update_cuesheet`/`validate_cuesheet` never take a partial patch. `CUESHEET_PATH` (env var,
defaults to `./project.cuesheet.json`) selects which file is being edited; the web editor
watches the same file and refreshes automatically when the bridge writes to it.

**After a rebuild, restart the session/bridge — and point `CUESHEET_PATH` at the episode you
actually mean.** MCP servers do not hot-reload: a Claude Code session that attached before a
`pnpm -r build` keeps running the previous `dist` (old tool set/behavior) until it is restarted.
To make this visible, the bridge prints a startup banner to stderr on boot — resolved
`CUESHEET_PATH`, package version, and the live tool names — so you can confirm what you attached
to instead of guessing. Separately, the root `.mcp.json` pins `CUESHEET_PATH=project.cuesheet.json`
(the seed cuesheet), so out of the box the bridge edits *that*, not an episode. To edit an episode
via the bridge, launch it with `CUESHEET_PATH=episodes/<slug>.cuesheet.json` and restart — the same
env-var handoff `.claude/commands/episode.md` step 6 uses for the web editor — rather than editing
the tracked `.mcp.json` with a personal episode path. Unifying "the active episode" across the web
editor, `pnpm episode`, and the bridge is tracked in #25.

Setting `CUESHEET_BRIDGE_READONLY=1` runs the bridge read-only: every `update_cuesheet` call is
refused with a structured `{ok:false, errors:[...]}` naming the variable to unset, and nothing
is written. `get_cuesheet`, `validate_cuesheet`, and `get_schema` are unaffected — exactly what a
review-only or demo session needs.

## Web editor HTTP endpoints (agent-callable)

The web editor's dev server (`pnpm --filter @cuesheet/web dev`, default `localhost:5173`)
exposes a few plain HTTP endpoints beyond the bridge's MCP tools:

- `GET /api/frame-capture?clip=<filename>&atS=<source-seconds>` — captures one full-resolution
  PNG frame straight from the original clip at `atS` seconds into that clip.
- `GET /api/bgm-files` — lists usable background-music audio files (recursively under repo
  `media/` plus the current cuesheet's `clipDir`), each with a probed `durationS`.
- `POST /api/render` runs the same render the Export step's button triggers. Output lands at
  `out/<project-name> <timestamp>.mp4` (not `out.mp4`); `GET /out.mp4` is a separate, stable
  alias that always streams back whichever file the most recent render produced. Note that
  `out.mp4` is also, confusingly, the `cuesheet-render` CLI's own default output argument — the
  two are independent paths that happen to share a name.

## UI / design system

If a task touches the web editor's UI (`apps/web`), that's development work, not operating the
pipeline — read [CLAUDE.md](./CLAUDE.md) instead of relying on this file. In short: the editor is
built on the Astryx design system, and CLAUDE.md's `<!-- ASTRYX:START -->` block (in "Design
principles") is the generated component/template catalog cheat sheet — check it (and `astryx
build "<idea>"` / `astryx template --list`) before hand-building any structure, per the
"adopt templates by purpose/goal/data-hierarchy, check the catalog first" principle in
`docs/design-principles.md`.

## File/path conventions

- `episodes/<slug>.cuesheet.json` — per-episode cuesheet naming used by `pnpm episode` (`<slug>`
  = the source folder's basename, slugified).
- `project.cuesheet.json` (repo root) — the default single-project cuesheet the MCP bridge and
  ad hoc CLI runs use unless `CUESHEET_PATH` says otherwise.
- `media/drafts/<slug>/` — scan/assemble working artifacts (`manifest.json`, extracted frames,
  `moments.json`, `progress.json`). **Gitignored** — personal raw-footage-derived data, never
  committed.
- `clipDir` (a field inside the cuesheet, e.g. `media/clips`) — the folder actual video clips
  live in. Keep it repo-relative (or otherwise resolvable from wherever the cuesheet is being
  read) rather than an absolute path tied to one machine.
- Rendered/generated outputs (`out.mp4`, `out/*.mp4`, `*.srt`, `proto_*.mp4`, proxies,
  thumbnails) are **never committed** — see `.gitignore`.

## Typical workflows

**New episode, end to end** (step-by-step walkthrough with failure symptoms:
[docs/FIRST-EPISODE.md](docs/FIRST-EPISODE.md)): `pnpm episode "<folder>"` (scans, boots the
editor — no draft yet) -> in Claude Code, `/episode <folder>` (vision judgment -> assemble ->
subtitle voice pass; this is what actually produces the draft) -> open
`http://localhost:5173`, review the rough cut, hand-edit anything -> press render in the editor
(lands at `out/<project-name> <timestamp>.mp4`, downloadable via the stable `GET /out.mp4`
alias) (or run `cuesheet-render episodes/<slug>.cuesheet.json out.mp4`).

**Bulk subtitle edit via MCP**: connect to `cuesheet-bridge`, call `get_cuesheet`, compute a new
`segments` array with every `subtitle` rewritten (e.g. tone pass per `docs/voice-guide.md`),
call `update_cuesheet` with the whole object. If unsure a rewrite will validate, call
`validate_cuesheet` first.

**Export**: from the web editor's Export step (burn-in toggle, SRT download), or directly via
`cuesheet-render <cuesheet.json> <out.mp4> --srt <out.srt>`. Use `--json` if a script needs to
consume the result programmatically instead of a human reading stderr.
