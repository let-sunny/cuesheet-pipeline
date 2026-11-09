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

The package bins (`cuesheet-draft`, `cuesheet-render`) are not on `PATH` from a plain checkout.
Run them via `pnpm --filter @cuesheet/draft exec cuesheet-draft <args>` /
`pnpm --filter @cuesheet/render exec cuesheet-render <args>`, or invoke the built entry directly
— `node packages/draft/dist/cli.js <args>` and `node packages/render/dist/index.js <args>`. The
two entry filenames deliberately differ (`cli.js` vs `index.js`), so don't infer one from the
other; a missing file usually means "not built yet", not "wrong path".

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
  [--fps 30] [--width 1280] [--height 720] [--boundary-pad 0.4] [--config <path.json>] [--domain <dir>] [--json]
```

`--domain <dir>` points at a domain theme bundle (e.g. `domains/knitting`): moments are validated
against that domain's shot vocabulary and its grammar + face policy drive assembly (`--config`
still overrides on top). Omit for the engine defaults.

`moments.json` is the one vision-judgment artifact in the pipeline — an agent writes it by
looking at the frames scan just extracted (schema: `momentsFileSchema` from `@cuesheet/draft`,
documented in `.claude/commands/episode.md` and `packages/draft/README.md`). On failure, both
subcommands print `fieldpath: reason` to stderr and exit 1. For the exact `--json` envelope
shape, call `get_capabilities` (its `clis` entry points at the pinning test) rather than reading
it here.

### `cuesheet-render` (cuesheet -> final video/subtitles)

```bash
cuesheet-render [cuesheet.json] [output.mp4] [--no-subtitles] [--srt <path>] [--ass <path>] [--json]
# defaults: project.cuesheet.json -> out.mp4, subtitle burn-in on
```

`--no-subtitles`: clean video, no burned-in drawtext (pair with `--srt`/`--ass` for a separate CC
track). `--srt` is plain text + timing only; `--ass` (SubStation Alpha) also carries the
resolved per-cut font/size/color/outline/position/background, so DaVinci Resolve (and most NLEs)
import it already styled instead of resetting to their own default subtitle look. Requires
ffmpeg on `PATH`; for cuesheets with subtitles, macOS's Homebrew default
`ffmpeg` is missing `drawtext` — install `ffmpeg-full` instead (see `packages/render/README.md`).
Renders run synchronously and can take minutes; macOS ships no `timeout(1)`, so bound a long
render with `gtimeout` (coreutils) or run it in the background rather than assuming it hung.

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
`update_cuesheet`/`validate_cuesheet` never take a partial patch. Which cuesheet is edited is the
**active episode**, resolved fresh on every tool call: explicit `CUESHEET_PATH` env > the repo-root
`.active-episode` file > `./project.cuesheet.json`. The web editor edits the same active cuesheet.
Switching episode (via `pnpm episode`, or the editor) rewrites `.active-episode`; because the
bridge re-resolves per call, it follows the switch without a restart. `.active-episode` is
gitignored (it points at a personal episode path).

**After a rebuild, still restart the session/bridge.** MCP servers do not hot-reload: a Claude
Code session that attached before a `pnpm -r build` keeps running the previous `dist` (old tool
set/behavior) until it is restarted. The bridge prints a startup banner to stderr on boot — the
resolved active-episode path, package version, and the live tool names — so you can confirm what
you attached to; the banner also notes that the path re-resolves per call. To force a specific
file regardless of `.active-episode`, set `CUESHEET_PATH` explicitly (it wins) — e.g. the e2e
suite pins it for hermeticity.

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

## When the web editor's dev server needs a restart

The dev server (`pnpm --filter @cuesheet/web dev`) is a long-running Node process — it loads
`@cuesheet/schema`/`@cuesheet/render`'s **compiled `dist/`** once at startup and keeps it in
memory, and it builds its clip/proxy lookups from whatever the raw folder looked like when it
booted. Several real incidents (2026-11-09) came from forgetting this. Restart it (`pkill` the
`vite` process bound to port 5173, then `pnpm --filter @cuesheet/web dev` again) whenever any of
these happen, **in this order relative to the restart**:

1. **You changed `packages/schema/src` (e.g. added a field) or `packages/render/src`.** Rebuild
   first (`pnpm --filter @cuesheet/schema build` / `pnpm --filter @cuesheet/render build`), *then*
   restart the dev server — editing `src/` alone does nothing for a process that already loaded
   the old `dist/`. Symptom if you forget: a save error like `"The save system needs an update -
   restart the server and try again (lost fields: segments[0].<newField>)"`.
2. **You renamed/moved a raw-footage event-subfolder** (e.g. a content-misidentification fix,
   correcting which garment/subject an event-subfolder actually shows). Before restarting, also delete that
   clip's now-orphaned proxy file(s) under `media/proxies/` (named `<old-folder>__<clip>.mp4` —
   they won't be found again under the new name, and a stale one left behind is just dead weight,
   not a bug by itself). Symptom if you skip the restart (or forget to delete the orphan first):
   the renamed clip shows a **black screen** in the editor — the server can't find a proxy under
   the new name, falls back to serving the original, and the original is usually 4K HEVC the
   browser can't decode (see `clipsRoute.ts` / `generateProxies` in `apps/web/src/server/media/`).
   After restarting, give it a bit — proxy regeneration runs in the background, sequentially, one
   clip at a time, across the whole raw folder; `GET /api/proxy-status` shows the queue, or just
   watch `media/proxies/` for the new file to appear (a `.tmp` file there means it's mid-convert).
3. **You edited a cuesheet or raw folder directly on disk while the browser tab was already
   open.** `fs.watch` normally pushes the server's view of cuesheet changes to the browser live,
   but if the browser has its own unsaved/stale in-memory state (e.g. the user was mid-edit, or a
   save just failed per case 1), a save from the browser can clobber your direct file edit right
   back to the stale version. This isn't fixed by a server restart — it needs the browser tab
   itself reloaded (or the user to avoid saving from the UI until your edits are confirmed
   landed). When in doubt about which state is current, ask the user rather than assuming your
   last write survived.

A plain cuesheet content edit (subtitles, segment order, crop/rotate values) needs **no restart**
— the dev server reads the cuesheet file fresh on each request and `fs.watch` pushes it to the
browser live.

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
- `.active-episode` (repo root) — a one-line pointer to the active episode's cuesheet, read by
  the web editor, the bridge (per tool call), and `pnpm episode` (which writes it). **Gitignored**
  — points at a personal episode path. `CUESHEET_PATH` overrides it; absent both, the default is
  `project.cuesheet.json`.
- `project.cuesheet.json` (repo root) — the default single-project cuesheet used when neither
  `.active-episode` nor `CUESHEET_PATH` selects another.
- `media/drafts/<slug>/` — scan/assemble working artifacts (`manifest.json`, extracted frames,
  `moments.json`, `progress.json`). **Gitignored** — personal raw-footage-derived data, never
  committed.
- `clipDir` (a field inside the cuesheet, e.g. `media/clips`) — the folder actual video clips
  live in. Keep it repo-relative (or otherwise resolvable from wherever the cuesheet is being
  read) rather than an absolute path tied to one machine. It (and `cuesheet-draft --clip-dir`)
  may be a symlink — e.g. `media/dotmix_src` pointing into an iCloud folder — which scan and
  render resolve through transparently.
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
`segments` array with every `subtitle` rewritten (e.g. tone pass per the domain voice profile,
`domains/knitting/voice.generated.md`),
call `update_cuesheet` with the whole object. If unsure a rewrite will validate, call
`validate_cuesheet` first.

**Export**: from the web editor's Export step (burn-in toggle, SRT download), or directly via
`cuesheet-render <cuesheet.json> <out.mp4> --srt <out.srt>`. Use `--json` if a script needs to
consume the result programmatically instead of a human reading stderr.
