# Architecture

> Snapshot of the system as of 2026-07-08. This is a map, not a novel — for the product
> requirements see [PRD.md](PRD.md), for screen layout rules see
> [screen-spec.md](screen-spec.md), for the live "what's done / what's next" ledger see
> [STATUS.md](STATUS.md) (Korean, internal working doc).

## 1. System overview

```
footage folder (no dialogue, visual-only)
      |
      | pnpm episode "<folder>"  (scripts/episode.mjs: validate folder, run scan, boot web
      |                           server + browser)
      v
+---------------------------- episode pipeline -----------------------------+
|  scan (cuesheet-draft CLI)                                                |
|    -> seek-based frame extraction per clip, interval by clip length        |
|    -> media/drafts/<slug>/manifest.json                                    |
|                                                                             |
|  vision judgment (Claude Code, /episode command, no extra API cost)        |
|    -> looks at extracted frames, writes moments.json (shot type, quality,  |
|       face exposure, timelapse-candidate ranges)                          |
|                                                                             |
|  frogging pass (packages/draft progress.ts, optional, long takes only)     |
|    -> Claude compares adjacent frame pairs over time to detect             |
|       "mistake / frog it and restart" narratives -> progress.json          |
|                                                                             |
|  assemble (cuesheet-draft CLI)                                            |
|    -> deterministic rules over moments.json: quality filter, cut-rhythm    |
|       convergence, timelapse connectors, face-risk guard, sort            |
|    -> validateCueSheet -> episodes/<slug>.cuesheet.json                    |
|                                                                             |
|  voice pass (Claude Code, /episode command)                               |
|    -> rewrites placeholder subtitles in the user's tone, via the MCP       |
|       bridge (update_cuesheet)                                            |
+-----------------------------------------------------------------------------+
      |
      v
  cuesheet JSON (single source of truth, validated by @cuesheet/schema)
      |
      +--> web editor (Scenes -> Edit -> Export) --- polishes the same file
      |        (saves via /api/cuesheet, sees external changes via fs.watch)
      |
      +--> MCP bridge (get_cuesheet / update_cuesheet) --- Claude Code edits the
      |        same file from natural-language commands, no app-side LLM call
      |
      v
  render (@cuesheet/render, ffmpeg)
      |
      +--> final .mp4 (burned-in or clean)
      +--> .srt (buildSrt, same cuesheet)
```

The cuesheet file is the only channel between "automation" and "human/AI edit" — nothing
downstream (render, SRT) ever reads anything but the validated JSON on disk.

## 2. Package map

### `@cuesheet/schema`

**Responsibility**: the zod contract for the cuesheet format — the single source of truth
every other package imports instead of redefining types.

**Public surface**: schemas (`cueSheetSchema`, `projectSchema`, `segmentSchema`,
`bgmCueSchema`, `cropSchema`, `subtitleStyleSchema`, `subtitleStyleOverrideSchema`,
`subtitleStylePresetsSchema`, `subtitleBackgroundSchema`, `narrationConfigSchema`,
`titleSchema`, `titleBackdropSchema`, `titlePresetSchema`), types derived via `z.infer`
(`CueSheet`, `CueSheetInput`, `Segment`, `Project`, `BgmCue`, `Crop`, `SubtitleStyle`,
`SubtitleStyleOverride`, `SubtitleStylePresets`, `SubtitleBackground`, `NarrationConfig`,
`Title`, `TitleBackdrop`, `TitlePreset`), `validateCueSheet` (returns
`{ok:true, data}` or `{ok:false, errors: string[]}`, one `fieldpath: reason` string per
issue), and `findLostFieldPaths(original, serialized)` — the save-time guard that detects
when a zod object silently stripped a field the server doesn't know about yet (e.g. a client
sends `crop` to a server still running an old schema build).

`cueSheetSchema.subtitleStylePresets?: Record<name, subtitleStyleOverride-shape>` (PRD backlog
#1) is a project-level dictionary of reusable named subtitle style overrides;
`segment.stylePreset?: string` opts a cut into one of them, cross-validated in the sheet-level
`superRefine` (a segment alone can't see its sheet's presets) — a `stylePreset` that doesn't
resolve to an existing key fails with `segments[i].stylePreset: ...` even though the segment
schema itself would accept any non-empty string. **Effective subtitle style merge order (used
identically by render and the web preview): global `subtitleStyle` < named preset (if
`stylePreset` resolves) < segment `styleOverride`** — each step is a shallow merge (background
replaced wholesale, not partially merged, at each step) applied in that order, so a per-cut
override always has the final say over a preset, which always has the final say over the
global style.

`segment.title?: {text, preset: "gooey"|"melt"|"particle"|"typing", durationS?, backdrop?:
{dim}}` (PRD backlog #2) is an optional title card shown at the cut's start (there is no
separate `start` field — a title always begins at the segment's own local t=0).

**Deliberately does not**: know about ffmpeg, files on disk, HTTP, or React. It has zero
runtime dependencies besides zod.

### `@cuesheet/draft`

**Responsibility**: turns a raw footage folder into a rough-cut cuesheet. This is the "core"
package per STATUS.md — the thing that makes the north star ("throw in footage, get a rough
cut") possible without scene-detection (measured and rejected — see decision log below).

**Public surface**: CLI `cuesheet-draft scan <folder> --out <workdir>` (skips
not-yet-downloaded iCloud files by checking `stat blocks===0`, probes duration with ffprobe,
extracts 640px seek-based frames at an interval keyed to clip length — 2s under 15s clips, 5s
under 60s, 15s under 300s, 60s beyond — writes `manifest.json`) and
`cuesheet-draft assemble --manifest <path> --moments <path> --clip-dir <folder> --project-name
<name> --out <cuesheet.json> [--fps] [--width] [--height] [--boundary-pad]` (validates
`moments.json` against `momentsFileSchema`, calls `assembleDraft`, then `validateCueSheet`
before writing; on failure of either, prints `fieldpath: reason` lines and exits 1). Library
exports: `scanFolder`, `intervalFor`, `assembleDraft`, the moments/progress zod schemas and
types, `buildPairSchedule`, `extractNarrativeEvents` (frogging detection).

Inside `assembleDraft`: keeps moments with `quality >= 3`, pads each cut's boundaries by
0.4s by default (avoids cutting off a hand gesture mid-motion), clamps oversized cuts
symmetrically, converges the steady-cut average toward 2.8-3.0s by shrinking the longest cut
in 0.25s steps when the average exceeds 3.1s (matches the measured user rhythm), inserts up to
8 timelapse connectors (speed 14x) from `monotonousRanges` that are 30-60s long and not
face-risky (`faceExposed` field if present, otherwise a face-word + "exposure" text
heuristic), then sorts by clip filename then `in`.

**Deliberately does not**: run any vision model itself, or do scene-cut detection (see
decision log — measured on real footage and excluded).

### `@cuesheet/render`

**Responsibility**: turns a validated cuesheet into an actual video (and/or subtitle file)
via ffmpeg. The only package that ever shells out to ffmpeg for final output.

**Public surface**: `buildRenderPlan(cue, outputPath, {burnSubtitles?, sourceDimensions?,
titleAssets?})` — pure, synchronous function returning `{args, filterComplex, outputPath,
warnings}` (trim via `-ss`/`-t`, `setpts` for speed, `crop` filter from `segment.crop` ratios,
always `scale=W:H` + `setsar=1` + `fps=N`, `drawtext` per-segment when `burnSubtitles` and the
segment has subtitle text using `resolveSubtitleStyle`'s merge result, `atempo` chain for
out-of-range speeds, `concat`, then `bgm`/`narration` via `adelay`+`volume` into `amix`).
`resolveSubtitleStyle(cue, segment)` implements the global-preset-override merge order (see
schema section above). `buildSrt(cue)` / `secondsToSrtTimestamp` — walks segments in order
accumulating `(out-in)/speed` as the output timeline, skips blank-subtitle cuts, renumbers
sequentially. CLI `cuesheet-render [cuesheet.json] [out.mp4] [--no-subtitles] [--srt <path>]`.

**Title cards (PRD backlog #2, see docs/research/title-render-spike.md)**: `buildRenderPlan`
itself stays pure/synchronous — it only *wires in* an already-prepared `TitleAsset` per segment
index (passed via `opts.titleAssets`), throwing a `segments[i].title: ...` fieldpath error if a
segment has a `title` but no matching entry. The actual disk/browser work lives in
`title.ts`'s `prepareTitleAssets(cue, {cacheDir?})` (async, called by the CLI and by
`@cuesheet/web`'s `/api/render` route *before* `buildRenderPlan`): for `preset: "typing"` it
writes an ASS file (`buildTitleAssContent` — per-character `\k` karaoke reveal + a whole-line
`\fad`, wired into the segment's filter chain via `subtitles=<path>`, no caching needed since
ASS generation is instant); for `"gooey"/"melt"/"particle"` it computes a content-addressed
`titleCacheKey(text, preset, durationS, project dims/fps)`, and on a cache miss, dynamically
imports `playwright` (a `dependencies` entry, imported dynamically so a typing-only render still
works in an environment where it failed to install) to headless-capture a deterministic
`window.seekAnimation(frame)`-driven HTML animation (`titleAnimations.ts`) into a
`frame_%04d.png` sequence under `media/title-cache/<hash>/` (gitignored); `buildRenderPlan` then
adds that PNG sequence as an extra `-framerate <fps> -i frame_%04d.png` input and composites it
via `overlay=...:enable='between(t,0,durationS)'`. `title.backdrop.dim` (either preset) becomes
a `color=black...,fade=...:alpha=1,colorchannelmixer=aa=<dim>` layer alpha-composited under the
title, faded in/out with the same envelope the web preview's `TitleOverlay` component computes
(`backdropOpacity`), so the two never visually drift apart. `buildRenderPlan` also adds
`-filter_complex_threads 1` whenever any segment wires in a captured-frames title - empirically
required (2026-07-09): 3+ simultaneous captured-frames overlay branches feeding one `concat` in a
single ffmpeg invocation reliably deadlocks ffmpeg's default multi-threaded filter scheduler
(reproduced; forcing single-threaded filter execution fixes it at a negligible cost, since encode,
not filtering, is the actual bottleneck).

**Deliberately does not**: touch the cuesheet file (read-only consumer), or know about the
editor's undo/save state — it only ever sees whatever `@cuesheet/schema` validated. Title
capture is the one exception to "buildRenderPlan has no I/O" — kept out of that function
entirely and pushed into the separate `prepareTitleAssets` step for exactly that reason.

### `@cuesheet/bridge`

**Responsibility**: the MCP server Claude Code attaches to so the user can edit the cuesheet
by typing natural language in their own Claude Code session — no Claude API call inside the
app, no extra cost.

**Public surface**: two tools, `get_cuesheet` (reads `CUESHEET_PATH`, returns
`validateCueSheet` result as text) and `update_cuesheet({cuesheet})` (validates the full
replacement object, rejects on validation failure or on `findLostFieldPaths` detecting a
silent field loss, otherwise writes the canonical `JSON.stringify(result.data, null, 2)` to
disk). Registered in the root `.mcp.json`, editing `project.cuesheet.json` by default via
`CUESHEET_PATH`.

**Deliberately does not**: apply partial patches — every edit is "read the whole cuesheet,
compute the whole new cuesheet, send it back," which is what makes the tool surface stay at
two calls no matter how the schema grows.

### `@cuesheet/web`

**Responsibility**: the touch-up editor — the "(2) polish it in the browser" and
"(3) export" legs of the north star — plus the dev-server endpoints that back the pipeline
integration (proxies, thumbnails, moments palette, narration/clip file pickers).

**Public surface (Vite plugin `cuesheetPlugin` in `cuesheet-plugin.ts`)**:
- `GET/POST /api/cuesheet` — read/write the cuesheet file; POST re-validates, runs the lost-
  field guard, and only then writes.
- `POST /api/render` (+`GET /api/render/status`) — re-reads the saved cuesheet, calls
  `prepareTitleAssets` first if any segment has a `title` (populating/reading
  `media/title-cache/`), then `buildRenderPlan`, runs ffmpeg in the background reporting parsed
  `time=` progress; 409 if a render is already running (single in-flight job, no queue).
- `GET /api/subtitles.srt` — `buildSrt` over the saved cuesheet, downloadable.
- `GET /clips/*` — serves clip video, preferring the generated 720p proxy over the original
  unless `?original=1`; range-request aware.
- `GET /api/clip-files`, `GET /api/narration-files[/:name]`, `GET /api/local-video?path=` —
  file pickers/streaming for intro-outro, narration audio, and arbitrary local video.
- `GET /api/moments`, `GET /draft-frames/*`, `GET /api/draft-frames/:clipFolder` — serves the
  scan-stage moments dataset and its thumbnail frames to the Scenes step.
- `GET /api/thumb?clip=&t=&w=` — seeks a frame out of the proxy for cut-list/timeline
  thumbnails, disk-cached, dedup'd in-flight, and rate-limited to 2 concurrent ffmpeg jobs.
- `GET /api/proxy-status` — pending/generating proxy queue, backs the "preparing video" UI
  state.
- `GET /out.mp4` — download the last render output.
- `fs.watch` on the cuesheet file/dir, pushes a `cuesheet:changed` custom Vite HMR event so
  the client auto-refreshes on external writes (bridge edits, direct file edits).

Editor UI: three steps — **Scenes** (`MomentPalette.tsx`, scene candidate cards with
in-use/auto-excluded state, category/status filters, add/remove, set intro/outro),
**Edit** (`CompactSegmentList.tsx` + `TimelineView.tsx`/`MiniTimelineStrip.tsx` +
`VideoPreview.tsx`/`SequencePlayer.tsx` + `SegmentQuickFields.tsx`/
`SegmentStyleOverride.tsx`/`CropEditOverlay.tsx`/`IntroOutroEditor.tsx`/`TitleOverlay/` —
single screen, no modes, per screen-spec section 3-4), **Export** (`FinishingSettings.tsx` +
`SubtitleStylePresetsSettings.tsx` + `RenderSettingsDialog.tsx` — project metadata, global
subtitle style, named subtitle style presets (PRD backlog #1), intro/outro, BGM, narration,
resolution presets 720p/1080p/4K with proportional subtitle-metric scaling, burn-in toggle,
SRT download).

`components/TitleOverlay/` (`TitleOverlay.tsx` + co-located `TitleOverlay.styles.ts` +
co-located `TitleOverlay.test.tsx` + `index.ts`) is the repo's first full component-anatomy
exemplar (CLAUDE.md "component layering") for a component built from scratch;
`components/StepNav/` (2026-07-09) is the first exemplar of *migrating* an existing component
into that same shape — see `docs/styling-migration.md` for the recipe this becomes the template
for (the remaining ~2000 lines of `styles.css`). TitleOverlay renders the same 4 title presets `VideoPreview`
and `SequencePlayer` need live, driven purely by `localTimeS` (playback time relative to the
segment's own start): `typing` reveals characters via CSS opacity (mirroring the ASS `\k`
timing), `gooey`/`melt` render SVG circles under a CSS goo filter (ported from
`packages/render/src/titleAnimations.ts`'s capture math, just driven by a continuous `progress`
fraction instead of a discrete frame index), `particle` samples the text into a canvas point
cloud once per text and eases particles in. This is a second, independent implementation of the
same visual (same intentional duplication pattern as `subtitleOverlay.ts` vs `plan.ts`'s
drawtext) — real-time DOM/canvas for live preview vs. frame-stepped headless capture for the
render, because the two run under fundamentally different timing models.

**Deliberately does not**: call any LLM itself, or run ffmpeg for anything except its own
render/proxy/thumbnail jobs (final render logic is entirely `buildRenderPlan` imported from
`@cuesheet/render`, not reimplemented).

## 3. Dependency graph

```
              +--------------------+
              |  @cuesheet/schema  |
              +--------------------+
                 ^    ^    ^    ^
                 |    |    |    |
        +--------+    |    |    +--------+
        |             |    |             |
  @cuesheet/draft  @cuesheet/bridge  @cuesheet/render
                                          ^
                                          |
                                    @cuesheet/web
                                          |
                                          v
                                   @cuesheet/schema
```

Verified against each `package.json`'s `dependencies`: `draft`, `render`, `bridge` each
depend only on `@cuesheet/schema` (+ zod). `web` depends on both `@cuesheet/schema` and
`@cuesheet/render`. No package depends on `web`. No cycles.

**Why `web -> render` exists**: the editor's Export step needs to actually produce output
(`POST /api/render`) and the SRT download (`/api/subtitles.srt`) without reimplementing the
ffmpeg command graph or the SRT-timing logic a second time — `cuesheet-plugin.ts` imports
`buildRenderPlan` and `buildSrt` directly from `@cuesheet/render` and calls them against the
cuesheet the user just saved. This is also why the live preview in the editor
(`subtitleOverlay.ts`'s `mergeSubtitleStyle`) mirrors `plan.ts`'s `resolveSubtitleStyle`
merge rule by design comment, not by coincidence — same global-preset-override merge order,
kept in sync deliberately.

## 4. Key design decisions

- **Cuesheet as shared state**: both Claude Code (via the bridge) and the human (via the
  web editor) mutate the same JSON file, so natural-language edits and hand edits never
  conflict — there is exactly one document to reconcile.
- **Seconds, not frames**: every schema time field is in seconds; only `render` converts to
  frames, using `project.fps`, keeping the contract independent of any particular frame rate.
- **Filename-only clips + `clipDir`**: `segment.clip` stores just a filename; the folder is
  a separate `clipDir` field, so moving the footage folder doesn't invalidate every segment.
- **Zod-derived types**: TypeScript types come from `z.infer` over the schema, never
  hand-duplicated, so validation and types cannot drift apart.
- **Scene detection excluded (measured, not assumed)**: ffmpeg scene-score maxed out at
  0.090-0.091 on two real long-take episodes (well under any usable threshold), and the
  highest-scoring moments didn't even correlate with the human-identified highlights — so
  scene detection was ruled out based on data, not intuition.
- **Seek-based frame extraction**: `-ss` before `-i` (seek in the demuxer) instead of a full
  decode pass — a full scene-detection decode of a 29-minute clip took ~10 minutes; seek-based
  sampling finishes in seconds.
- **Vision-only signals + temporal pair comparison for frogging**: since the footage has no
  narration, all shot judgment is Claude Vision reading frames, coarse-to-fine (60s grid,
  then bisecting on visible change) rather than audio/transcript analysis (there is nothing
  to transcribe). "Mistake / frog it and restart" narratives specifically need *two* frames
  compared over time (progress.ts) — a single frame can't tell growing from unraveling.
- **Aspect-locked reframe (`w == h` in ratio space)**: `crop` is defined in fractions of the
  original frame's width/height independently; the render pipeline always finishes with
  `scale=W:H`, which stretches non-uniformly if the crop rectangle's pixel aspect ratio
  doesn't already match the project's. Locking the drag handles to `w == h` in the ratio
  coordinate space keeps the crop's pixel aspect ratio equal to the source frame's aspect
  ratio (since source and project share aspect ratio), which is what stopped vertical crops
  from rendering squashed.
- **Face policy as a product feature, not an afterthought**: the chin-line-only rule is
  encoded from scan (vision flags `faceExposed`) through assemble (skips risky timelapse
  slices) through the editor (reframe UI, exclusion badges) through pre-export review — it's
  a PRD success criterion ("zero face-policy violations"), not a one-off filter.
- **Validation error format `fieldpath: reason`**: every validation failure (schema, CLI,
  bridge, web save) reports as e.g. `segments[0].in: in must be less than out`, so any layer
  can surface the same message format without translation.

## 5. Editor architecture

**Three steps** (Scenes / Edit / Export, internally `"compose" | "edit" | "finish"` in
`App.tsx` state, English UI labels per PRD section 4's terminology dictionary): Scenes picks
material from the vision-scanned moment palette, Edit is a single no-modes screen (cut list +
mini timeline + sticky video column + cut settings, screen-spec section 3), Export configures
project/subtitle/intro-outro/BGM/narration and runs/downloads output.

**State model** (PRD section 6): three layers, matching in-memory-only / auto-backup /
saved-file. In-memory edit state has no user-facing name (just "what's on screen"). A
debounced (1s) `localStorage` snapshot per project name (`cuesheet-draft-snapshot:<name>`,
`App.tsx`) is the "Unsaved edits" safety net, surfaced only via a restore banner comparing the
snapshot against the freshly loaded saved file — never mentioned proactively. The disk file
served by `/api/cuesheet` is "Saved state" — the only thing Export, SRT, and the MCP bridge
ever read.

**Undo**: a 50-entry (`HISTORY_LIMIT`) in-memory history stack, batching consecutive edits
within `BURST_DEBOUNCE_MS` (500ms) so e.g. a subtitle keystroke run collapses to one undo
step; operates purely on screen state, independent of saving.

**Proxies**: 4K HEVC source footage can't play in-browser, so `generateProxies` (in
`cuesheet-plugin.ts`) background-generates 720p H.264 proxies per clip on server start (and
revalidates/regenerates corrupted ones via a decode-probe check at the 70% mark), and
`/clips/*` transparently prefers the proxy while the render path always uses the original.

**Live overlay parity with render**: the preview's subtitle overlay
(`lib/subtitleOverlay.ts::mergeSubtitleStyle`) and outline rendering
(`subtitleOutlineStyle`, CSS `-webkit-text-stroke` approximating ffmpeg `drawtext`
`borderw`) are written to match `render/plan.ts`'s `resolveSubtitleStyle`/`drawtextFilter`
merge and stroke-order semantics field-for-field, so what the editor shows is what the
export produces. The same parity intent extends to title cards: `TitleOverlay`'s
`backdropOpacity` envelope (fade-in/hold/fade-out shape) mirrors `title.ts`'s
`color=...,fade=...,colorchannelmixer=aa=<dim>` construction, though the two title
*animations themselves* (gooey/melt/particle) are deliberately separate implementations —
one real-time (DOM/canvas, driven by continuous playback time), one frame-stepped (headless
capture, driven by a discrete frame index) — since the two run under fundamentally different
timing models (see `components/TitleOverlay/` in section 2 above).

## 6. Pipeline contracts

- **`manifest.json`** (`media/drafts/<slug>/manifest.json`, `Manifest` type in `scan.ts`):
  `{ clips: [{ name, durS, interval, frames: [{t, path}] }], evicted: string[] }` — `evicted`
  lists source filenames skipped because they were still iCloud placeholders
  (`stat().blocks === 0`).
- **`moments.json`** (validated by `momentsFileSchema`, `types.ts`): an array of
  `{ clip, clipSummary, moments: [{inS, outS, shotType, memo, quality}],
  monotonousRanges: [{startS, endS, desc, faceExposed?}] }`, written by Claude after looking
  at the manifest's frames — the one and only vision-judgment artifact in the pipeline.
  `shotType` is a closed enum (`hand-closeup | object | cat | change | reveal | wearing |
  other`) taken from the user's actual editing vocabulary.
- **`progress.json`** (validated by `progressFileSchema`, `progress.ts`): an array of
  `{clip, tA, tB, verdict: grew|shrank|same|unclear, confidence 1-5, note}`, one entry per
  adjacent frame pair (`buildPairSchedule`, long takes >= 300s only) — feeds
  `extractNarrativeEvents` for frogging detection.
- **`episodes/<slug>.cuesheet.json`**: the per-episode cuesheet naming convention used by
  `pnpm episode` (`scripts/episode.mjs`), where `<slug>` is the source folder's basename
  slugified (non-letter/digit runs collapsed to `_`). The default single-project workflow
  (bridge, ad hoc CLI runs) instead defaults to `project.cuesheet.json` at the repo root via
  `CUESHEET_PATH`.
- **`media/title-cache/`** (gitignored, machine-local): `ass/<hash>.ass` for typing-preset title
  cards, and `<hash>/frame_%04d.png` + `<hash>/meta.json` (`{frameCount, fps}`) per
  gooey/melt/particle title, keyed by `titleCacheKey(text, preset, durationS, project
  width/height/fps)` (`title.ts`) — content-addressed, so two cuts with the same title text and
  preset (or a re-render of the same cut) reuse the same captured frames instead of re-running
  Playwright.

## Verification notes / doc-vs-code mismatches found

None of consequence — every endpoint, export, and CLI flag documented above was grepped/read
directly out of the current source (`packages/*/src`, `apps/*/src`, `scripts/episode.mjs`, `.mcp.json`,
`package.json` files) rather than recalled from STATUS.md prose. Two things worth flagging
for whoever reads this next:

- `packages/schema/src/schema.ts`'s `cropSchema` itself has no `w === h` refinement — the
  aspect lock is enforced only in the editor's drag UI
  (`CropEditOverlay.tsx::resizeSquare`), not at the schema/validation layer. A crop
  saved by hand-editing JSON or via the MCP bridge with `w !== h` is schema-valid and will
  render distorted. Not a bug in what exists today, just a gap between "product invariant"
  and "enforced invariant" worth knowing about.
- `@cuesheet/web`'s `package.json` has no `"@cuesheet/schema"`/`"@cuesheet/render"` version
  pin beyond `workspace:*`, consistent with the other packages — noted only because the
  dependency graph in section 3 is otherwise easy to get backwards (it's easy to assume
  `render -> web` instead of `web -> render`).
