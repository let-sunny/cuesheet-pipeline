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
  When a fix is mechanically computable (a numeric bound that can be clamped, an odd
  width/height, `in >= out`), the string carries an additional ` — <hint>` suffix, e.g.
  `segments[0].speed: speed must be <= 16 — clamp to 16`. The `fieldpath: reason` part before
  the suffix never changes, so match on that prefix rather than the full string; the hint is
  only ever a suggestion, not applied automatically (`{ok:false, errors: string[]}`'s shape is
  unchanged — see `packages/schema/src/hints.ts`).
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
  drift from what actually validates. For a one-line-per-feature index instead (each of the
  features listed above, plus crop and the subtitle background box, with its own `.describe()`
  text and a minimal working cuesheet snippet) — as well as an index of every bridge tool and CLI
  entry point — call `get_capabilities` (see below) instead of reconstructing this list by hand.

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
| `get_capabilities` | Once per session, or whenever exploring what this system can do, instead of reconstructing the feature list by reading source. Returns a capability manifest (see below). |

Every edit is "read the whole cuesheet, compute the whole new cuesheet, send it back" —
`update_cuesheet`/`validate_cuesheet` never take a partial patch. `CUESHEET_PATH` (env var,
defaults to `./project.cuesheet.json`) selects which file is being edited; the web editor
watches the same file and refreshes automatically when the bridge writes to it.

Setting `CUESHEET_BRIDGE_READONLY=1` runs the bridge in read-only mode (issue #12): every
`update_cuesheet` call is refused with a structured `{ok:false, errors:[...]}` response naming
`CUESHEET_BRIDGE_READONLY` as the variable to unset, and nothing is written. The tool stays in
`tools/list` either way (its description doesn't change per-mode, since MCP clients may cache the
list) — read-only shows up as a call-time refusal, not a missing tool. `get_cuesheet`,
`validate_cuesheet`, and `get_schema` are unaffected in read-only mode: exactly what a review-only
or demo session needs.

`get_capabilities` (issue #13) returns `{tools, clis, schemaFeatures}` — the discovery surface for
"what can an AI do with this system," generated live on every call (nothing is committed to the
repo, so there's no separate artifact to go stale): `tools` is the same name+description every
other bridge tool was registered with (read back, not retyped); `clis` names each
`cuesheet-draft`/`cuesheet-render` entry point plus a reference to the CLI surface section above
and the test file that pins its `--json` envelope, rather than restating the contract; and
`schemaFeatures` lists each expressive cuesheet feature beyond the basic trim/subtitle/speed/volume
fields (title cards, fade/dip transitions, episode-level fades, subtitle style presets, BGM
ducking, timelapse speed, crop, subtitle background box) with its field path, its own
`.describe()` text pulled straight off the zod schema (the same text `get_schema` serves), and a
minimal valid cuesheet snippet demonstrating it (`packages/bridge/test/capabilities.test.ts`
validates every snippet with `validateCueSheet`, so a schema change that breaks one is caught in
CI). Unaffected by read-only mode, same as the other read/grounding tools.

`update_cuesheet` on success: emits a structured receipt instead of just "saved" — `{ok:true,
receipt: {segmentCount, durationS, warnings}}`, mirroring the `--json` receipts the
`cuesheet-draft`/`cuesheet-render` CLIs return (see CLI surface above). `segmentCount` and
`durationS` (total post-speed output duration in seconds, intro/outro excluded — same v1
limitation as the CLIs' own duration math) are computed from the cuesheet that was just validated
and written, not from what you sent, so a caller can confirm an edit landed as intended without a
follow-up `get_cuesheet` call. `warnings` flags cheap structural issues (e.g. an edit that leaves
`segments` empty); it's aggregate facts about the new state only, not a field-by-field diff
against the previous value. On failure, the response is unchanged: `field-path: reason` lines and
nothing written.

`validate_cuesheet` on success also carries a `diff` comparing the candidate against the
currently-saved cuesheet — `{ok:true, diff: {durationDeltaS, segments, project, bgm,
narration}}` — so you can preview exactly what an edit would change before calling
`update_cuesheet` with it. Segments are identified by clip+in/out (not raw array position), so a
reorder reads as `segments.reordered: true` rather than N unrelated adds+removes:
- `segments`: `{added, addedTotal, removed, removedTotal, modified, modifiedTotal, reordered}`.
  `added`/`removed` are `{index, clip, in, out}` entries; `modified` entries are matched segments
  (same clip+in/out on both sides) whose other fields changed — `{index, clip, changes: [{field,
  before, after}]}`. Each of the three lists is capped at 5 entries independently for token budget;
  the matching `*Total` field always carries the true, uncapped count.
- `project`: field changes across `project.name/fps/width/height/fadeInS/fadeOutS`, `clipDir`,
  `intro`, `outro`, `subtitleStyle`, `subtitleStylePresets` — never capped (small fixed field set).
- `bgm`/`narration`: counts and field changes rather than a full per-cue diff — `bgm` is
  `{added, removed, modified}` (cues matched by file+start/end, `modified` = matched cues whose
  volume differs); `narration` is `{changed, fields}` (field-level diff when both sides have
  narration configured, or a single whole-object `narration` field change when it's toggled
  on/off).
`diff` is omitted entirely if there's no currently-saved cuesheet yet to compare against (e.g. the
very first save). This is strictly `validate_cuesheet`'s addition — `update_cuesheet`'s own
receipt is unchanged by this (see issue #10: the dry-run tool is where a preview belongs, not the
write path).

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
  lands at `out/<project-name> <timestamp>.mp4` (repo-root `out/` directory, filename sanitized
  from `project.name`, timestamped so repeated renders of the same project never overwrite each
  other) — **not** `out.mp4` at the repo root. `GET /out.mp4` is a separate, stable download
  alias that always streams back whichever file that render most recently produced. That bare
  `out.mp4` name is also, confusingly, the `cuesheet-render` CLI's own default output argument
  (see CLI surface above) — the two are independent paths that happen to share a name by
  convention, not the same file.

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
(lands at `out/<project-name> <timestamp>.mp4`, downloadable via the stable `GET /out.mp4`
alias) (or run `cuesheet-render episodes/<slug>.cuesheet.json out.mp4`).

**Bulk subtitle edit via MCP**: connect to `cuesheet-bridge`, call `get_cuesheet`, compute a new
`segments` array with every `subtitle` rewritten (e.g. tone pass per `docs/voice-guide.md`),
call `update_cuesheet` with the whole object. If unsure a rewrite will validate (e.g. you're not
sure every field survived), call `validate_cuesheet` first.

**Export**: from the web editor's Export step (burn-in toggle, SRT download), or directly via
`cuesheet-render <cuesheet.json> <out.mp4> --srt <out.srt>`. Use `--json` if a script needs to
consume the result programmatically instead of a human reading stderr.
