# CLAUDE.md

This file is guidance for Claude working in this repository (developing it — code, schema,
packages, tests). For an agent *operating* this tool on a user's behalf instead (running the
pipeline, editing a cuesheet via the MCP bridge, rendering output), see [AGENTS.md](./AGENTS.md).

## Project

A tool that makes YouTube editing as painless as possible in the browser, working from a **script**.
Rather than audio, editing is driven by the script — cutting several clips of raw footage and
assembling them into the final video — and that process is excessively manual (grunt work), so
automating and streamlining it is the core motivation. A cuesheet (JSON) serves as the contract,
connecting editing results to automatic rendering. Full-stack TypeScript, pnpm monorepo.

**North star (user-declared, 2026-07-05): "a personal, fully-tailored video editor."** You throw in
raw footage and get (1) a rough cut (cuesheet) auto-generated, (2) refine it in the browser with
video-editor-grade UX, and (3) render it right away — a personal, specialized editor. Two
differentiators from general-purpose transcript-based editors: it works on footage with no dialogue
(visual-based draft generation; transcript-based editing is useless for this content), and it bakes
in the user's own editing grammar (cut rhythm, shot vocabulary, narrative arc). Everything else a
general-purpose editor offers (multitrack, effects, general-purpose templates) is not being pursued
— "draft automation + a touch-up editor" is the whole front line.

**Real content example (read this to avoid misunderstanding): a knitting vlog.** The raw footage
shows hands/work while knitting and **has no dialogue (narration)**. The user writes a script
separately and overlays it as on-screen subtitles. So "script-based rather than audio-based" does
NOT mean "find spoken segments in the audio and align them with the script" — it means "find the
segment of raw footage that visually matches the action/scene a script (subtitle) line describes."
Therefore:
- When this project deals with "script-to-footage matching," **audio-transcript-based matching
  (transcript/Whisper, etc.) is fundamentally unsuitable by default** — there's no dialogue in the
  raw footage, so there's nothing to transcribe in the first place. Matching must be based on
  **visual content** (e.g., judged by having Claude Vision look at frames).
- When considering whether to apply an external tool (e.g. `claude-real-video`) to this project,
  even if that tool advertises audio/speech-centric features, **assume by default this project
  doesn't need those features** — lean toward cherry-picking only the visual-based features, like
  scene (frame) extraction.
- **Script order = footage time order (a vlog trait).** Matching is not a global search/reorder
  problem across the whole video — it's an **order-preserving (monotonic) alignment** problem: scan
  from the start and just find the boundary points. Building global matching logic would be
  over-engineering.
- **Raw clips vary wildly in length (as short as 3s, as long as 40min) and have little motion.**
  Most of it is subtle changes in knitting hands within long single takes with no cuts, so approach
  this assuming it's material where ordinary scene-transition detection may not fire well. The core
  automation deliverable is **extracting highlight positions** — "which timestamps in this footage
  are usable moments."
- **Face-disclosure policy (absolute rule, confirmed by user 2026-07-07): faces are shown only down
  to the chin** — the standard is "think of it as showing roughly down to the chin tip." Anything
  above the lips (including the lower lip) being visible is a violation, so either leave it out of
  the draft (or substitute a safe range from the same clip) or crop vertically down to the chin
  line. The scan (vision) stage must always judge and record whether a face is exposed, and
  auto-crop suggestions are the default behavior. **The same standard (chin-only) applies to other
  people's faces too, e.g. family.**
- **A clip 10+ minutes long is usually one of two things:** (1) shot to be sped up (timelapse) —
  schema's `segment.speed` can already express this, or (2) meant to have only a highlight portion
  picked out. When you hit a long clip, judging and proposing "speed up the whole thing, or which
  point to use as the highlight" is what makes things easiest for the user.

Work proceeds **fully autonomously** (don't block on questions) — see the goal command section
below for the detailed rules.

**Status-reporting convention**: `docs/STATUS.md` is the living status document (component map, key
decisions, work in progress, verification numbers). Update STATUS.md and git-commit at every
milestone — questions about "where things stand right now" are answered against this document.
Detailed rationale for decisions lives in docs subdocuments.

## Architecture

### Apps & packages

Apps are deployable applications; packages are libraries.

```
apps/
  web/      web app that edits/previews the cuesheet (produces the cuesheet)          [implemented]

packages/
  schema/   cuesheet type definitions + runtime validation (single source of truth)  [implemented]
  draft/    raw folder -> auto-generated rough-cut cuesheet (scan + frame extraction/assembly, vision judgment by Claude) [implemented]
  render/   takes a cuesheet and renders the actual video, ffmpeg etc. (consumes the cuesheet) [implemented]
```

### Data flow (who produces, who consumes)

```
  user's Claude Code ──(MCP/socket)──┐
                                   ├─▶  cuesheet (JSON)  ──▶  render  ──▶  final video.mp4
  human hand-editing (web) ─────────┘        ↑ web preview
```

The cuesheet is the **shared state (single source of truth)** of editing. Both natural-language
commands (e.g. "lower the voice to 30%") and hand-editing in the web app change the same cuesheet,
so they mix without conflict. render pulls that cuesheet into the final cut.

**The user's own Claude Code handles natural-language commands — the app does not embed a Claude
API (no added cost).** The editing bridge (MCP server preferred, or a local socket/HTTP) exposes
cuesheet-manipulation tools, and when the user gives a command in their own Claude Code, Claude Code
edits the cuesheet through those tools. The web app is the viewer/editor that previews and
hand-edits the result. Schema expressiveness is the ceiling of editing power, so as the range of
edits handled grows, schema expands along with it.

### Dependency direction (who imports whom)

```
  web  ──▶  schema
  web  ──▶  render  ──▶  schema
  draft ──▶  schema
  bridge ──▶  schema
```

- `schema` is the center of the contract. web, render, draft, and bridge all import
  `@cuesheet/schema`.
- `schema` **depends on none of the other packages** → no cycles.
- `web` also depends on `render` — the render-execution button (`buildRenderPlan`) and the SRT
  download (`buildSrt`, exported from `@cuesheet/render`) reuse the exact same logic as the render
  CLI. The principle: any logic that consumes a cuesheet to produce output (video/SRT) belongs to
  `render` — web does not reimplement the same logic.
- web validates with `validateCueSheet` before saving, and the renderer validates right before
  rendering. Since it's the same schema, any cuesheet that passes web is guaranteed to pass the
  renderer too.

## Core conventions (must follow)

- **Language policy (confirmed by user, finalized 2026-07-08): everything tracked in git is
  English.** Code, comments, docs, commit messages (conventional-commit format, English
  subject/body), issues/PRs, the public README, the GitHub wiki — anything that leaves the
  repository, or lives inside it. Two exceptions: (1) **content that Claude Code generates as
  working output** (subtitles, scene descriptions, etc.) follows the current working language
  (Korean, right now) rather than being translated — it isn't a translation target; (2)
  **`docs/voice-guide.md`'s Korean example sentences, vocabulary lists, and corpus-derived
  phrases** are data that define the target Korean voice and must stay in Korean verbatim even
  though the file itself lives in git.
- **GitHub wiki** = a write-up of experiments — where someone curious "why did this project happen
  and what experiments did it go through" reads (reverse-engineering the editing grammar, scene-
  detection measurement and exclusion, rough-cut v1-v4 experiments, etc.).
- **Web UI language principle (confirmed by user 2026-07-08): UI chrome is English, content follows
  the working language.** Buttons, labels, menus, status text — the screen's structural "chrome" —
  are all English (canonical terms are in `docs/PRD.md` section 4's glossary). Content data that
  Claude Code generates, like subtitles or scene descriptions, stays in the current working
  language (Korean right now), per the exception above — it isn't a translation target. The
  status-text principle ([situation] + [next action]) applies to the English chrome as well.
- **When writing a GitHub wiki page, don't repeat the title in the body** — the wiki already
  displays the page name as the title, so putting the same title (H1) on the body's first line
  reads as a duplicate. Start the body straight into the content.


- **Time unit is seconds.** Not frames. Frame conversion is handled only by render, via
  `project.fps`.
- **Clip paths are filename-only** (`segment.clip`); the folder is kept separate as `clipDir`, so
  moving folders doesn't break anything.
- **Types are derived from zod schemas** (`z.infer`). Don't hand-duplicate type definitions →
  prevents drift.
- On validation failure, give a message in `field-path: reason` format (e.g. `segments[0].in: in <
  out`).
- **No emoji** (in code, comments, commits, or subtitle text examples — anywhere).
- **Tests always select by `data-testid` (or ARIA role) — never by class name.** A class-based
  probe silently breaks the moment a styling refactor (e.g. the StyleX migration) renames or drops
  that class — this is a real incident that happened, not a hypothetical. Give a stable
  `data-testid` to every real interaction point: step-nav tabs, cut-list rows, cut-settings
  groups/fields, video controls (including Capture frame), the BGM gutter + add-track button,
  palette cards/actions, Export sections, render-dialog controls, restore-banner buttons, etc.
  Most Astryx components pass through arbitrary `data-*` attributes to the DOM via `BaseProps`'s
  `` data-${string} `` index signature (confirmed for `Button`/`Tab`/`Slider` - they spread a
  `...rest`/`...props` object that includes it), so `<Button data-testid="...">` just works — no
  wrapper needed. **This is not universal** — `CheckboxInput` declares the same `BaseProps` type
  (so TypeScript won't stop you) but its implementation destructures a fixed prop list with no
  `...rest` capture at all, so a `data-testid` passed to it is silently dropped, never reaching the
  DOM. Verify a given Astryx component's source before relying on this; where it doesn't forward,
  select by ARIA role + accessible name instead (e.g. `getByRole("checkbox", { name: "..." })` —
  Astryx's `Field`/`FieldLabel` render a real `<label htmlFor>`, so this works reliably).
  `apps/web/vitest.config.ts` runs two projects: `unit` (jsdom, the default) and `browser`
  (real Chromium via `@vitest/browser` + the Playwright provider, opt-in per file via
  `*.browser.test.tsx`) — reach for browser mode only for cases that need a real browser environment
  (layout/animation timing, real `<input>` focus/selection behavior); everything else stays on the
  fast jsdom unit tests. `tests/e2e/` (repo root) is a separate, thin Playwright smoke suite for
  full user journeys — see `tests/e2e/README.md`.

## No invented UI patterns (user rule, 2026-07-09)

Never invent a novel interaction pattern. Before designing any UI mechanism (trim,
scrubbing, lane editing, zoom, pickers), research how established editors (Premiere,
Final Cut, CapCut, Descript, YouTube Studio) solve it and adopt the convention — users
arrive with those instincts. Motivating incident: an invented "overview bar + zoomed
bar" two-level trim read as an uninteractive blue box and was judged unintuitive;
it is being replaced with the researched convention.

## Composition rule: groups are components, panels are arrangements (user rule, 2026-07-09)

A settings panel (cut settings, export sections) never accretes inline field groups.
Each functional group (Range, Playback, Subtitle, Title, Transitions, Reframe, Actions,
each Export section) is its OWN component with its own tests; the panel composes them —
arrangement only, no logic, no layout surprises. Adding a feature = build+test its group
component, then slot it into the arrangement. Motivating incident: TITLE/TRANSITIONS/
presets/ducking were bolted inline into panels in one day and the right column overflowed
the viewport while Export sections lost the grid discipline.

## Component layering (user rule, 2026-07-09)

Follow Astryx's component system as-is. Components own their styling (variants);
never restyle them through global CSS element selectors. When customization is
needed, add a NAMED wrapper component around the Astryx component (thin, same API
surface plus our constraint) — do not scatter per-call-site xstyle/style tweaks.
If the same tweak appears twice, that is the signal to promote it to a wrapper.
Domain-custom areas (timeline, crop overlay, palette cards, video stage) keep their
own CSS via explicit classes only.

Internal component anatomy follows Astryx's shape, scaled down: one folder per
significant component — `Component.tsx` (role header at top) + co-located
`Component.styles.ts` (co-located `stylex.create` — StyleX compilation is already
wired in the web build; custom DOM is styled the same way Astryx styles itself, so
cascade conflicts are structurally impossible) + `Component.test.tsx` + `index.ts`
export gate. Plain CSS survives only as a small tokens/base file (color variables,
reset); no per-component CSS files.
Reusable stateful logic is extracted into custom hooks (`src/hooks/`), each small
enough to unit-test on its own. `.doc.mjs` is omitted until we ship
public components. SYNC comments only where real cross-file chains exist.

## Testability as the size limit (user rule, 2026-07-09)

A file must always be small enough to write test code for. If a module is too big or
too entangled to test, that is the signal to split it — do not wait for it to hurt.
Corollary: pure logic (state transitions, calculations, parsing/formatting) lives in
its own module with unit tests; UI components stay thin over tested logic.

## Code layout

Within each source file, order top to bottom by importance (2026-07-08 convention, applied
repo-wide in a dedicated refactor pass):

1. **Exported types + the file's public surface** — props/option interfaces, exported type
   aliases, re-exports.
2. **The protagonist** — the main exported function/component the file exists for.
3. **Internal helpers** — private functions the protagonist (or its helpers) call.
4. **Trailing constants/micro-utils** — module-level constants and tiny utility values, placed
   last since they're implementation detail, not the point of the file.

React components: the main component goes above its private subcomponents/hooks/helpers.

This is a pure-reordering convention (zero behavior change; imports/exports stay semantically
untouched) — module-level `function` declarations are hoisted and `const`s are only read inside
function bodies invoked later, so moving a helper or constant below its caller is safe. Two
deliberate exceptions, both left as-is:
- **CLI/entry-point scripts with no exported surface** (e.g. `packages/draft/src/cli.ts`,
  `packages/bridge/src/index.ts`, `scripts/episode.mjs`) — the whole file's top-level flow *is*
  the protagonist, so "helper defined above its point of use, `main()` invoked at the bottom" is
  already the natural reading order; forcing the convention here would just churn without adding
  clarity.
- **`apps/web/src/cuesheet-plugin.ts`** — dominated by one large exported factory
  (`cuesheetPlugin`) whose ~20 helpers/state variables are only used inside the middleware
  closures it returns. Reordering it is mechanically safe but touches ~450 lines of a live
  dev-server plugin; treat as a separate, isolated follow-up (server stopped) rather than bundling
  it into a repo-wide sweep.

## Commands

From the root:

```bash
pnpm install
pnpm -r build      # build everything
pnpm -r typecheck  # type check
pnpm -r test       # tests (vitest)
```

A single package only:

```bash
pnpm --filter @cuesheet/schema test
```

## Stack

- TypeScript 5.x (strict, `noUncheckedIndexedAccess`)
- Validation: zod 4.x
- Testing: vitest
- Package manager: pnpm workspaces (`pnpm-workspace.yaml`)
- ESM (`"type": "module"`), internal imports use explicit `.js` extensions

## When adding a new package

- Wire `"@cuesheet/schema": "workspace:*"` into `packages/<name>/package.json`.
- Extend `tsconfig.base.json`.
- Don't build separate types/validation that contradict schema. Rule changes start in schema.

## Goal command orchestration (development workflow)

There's a `/goal` custom command: throw a goal at it and it runs to completion. Model role
separation:

```
  brain (Opus by default)  ──directs──▶  executors
  /goal command                          builder (Sonnet): implementation
  plan/decompose/integrate/verify        scout (Haiku): exploration/mechanical work
  (design decisions escalate to Fable)
```

- `.claude/commands/goal.md` — the brain. Default `model: claude-opus-4-8`. Only plans, decomposes,
  delegates, verifies, and reports.
  **Tiering convention (2026-07-06)**: day-to-day orchestration uses Opus; escalate to Fable for
  design decisions where direction is contested, conflicting research needs synthesizing, or a
  premise error is detected. Most tokens are spent by subagents, so the brain's model is chosen
  purely on judgment quality.
- `.claude/agents/builder.md` — implementation executor (Sonnet).
- `.claude/agents/scout.md` — exploration executor (Haiku).
- Specs are kept as a single consolidated writeup in `docs/goals/<slug>.md`.

Usage: `/goal <goal to achieve>` → requirements gathering → spec → implementation → verification,
all automatic.

## Editing bridge (Claude Code connection)

`@cuesheet/bridge` = the MCP server Claude Code attaches to. When the user gives natural-language
commands in their own Claude Code, it edits the cuesheet through these tools (no added API cost).
Validated by schema, so only ever-valid cuesheets get saved.

- Tools: `get_cuesheet` (read the current value), `update_cuesheet` (full replace + validate) — the
  latter is the core of "freedom": whatever the edit is, compute the whole new cuesheet and hand it
  over; it gets validated, then applied.
- Registration: the `cuesheet-bridge` server in the root `.mcp.json`. The edit target is
  `CUESHEET_PATH` (default `project.cuesheet.json`).
- The web app watches this file to refresh the preview (planned).
- So it flows without approval prompts, `.claude/settings.json` allows the bridge tools,
  Edit/Write, and the key pnpm commands. (For the autonomous editing cycle — the safety boundary is
  still anything hard to undo or that reaches outside the system.)

## Current status

- `@cuesheet/schema`: types + `validateCueSheet` + examples. Added audio `volume` to segment. 7
  tests passing.
- `@cuesheet/draft`: promoted the rough-cut pipeline — which until now existed only as ad-hoc
  session workflow scripts — into a proper package. CLI (`cuesheet-draft`) has 2 stages —
  `scan <raw-folder> --out <work-folder>` (checks `blocks===0` to skip un-downloaded iCloud files,
  runs ffprobe on local files only to collect duration, then does seek-based 640px frame extraction
  at length-based intervals (2s under 15s / 5s under 60s / 15s under 300s / 60s otherwise) ->
  `manifest.json`), `assemble --manifest --moments --clip-dir --project-name --out` (validates the
  `moments.json` that Claude wrote after looking at frames with zod, then applies assembly rules —
  keep quality>=3, insert a 30-60s slice as a speed-14x timelapse connector wherever a
  monotonousRange exists within the same clip (capped at 8 per episode), sort by clip filename then
  ascending `in` -> validates with `validateCueSheet` and saves, printing `field-path: reason` and
  exiting 1 on failure). Library exports `scanFolder`/`assembleDraft` (pure logic). 7 tests passing
  (quality filtering/sorting/timelapse-connector output-length calculation/8-cap/validation-failure
  case, etc.). Verified `scan` end to end against a real Dotmix raw folder (18 local / 33
  un-downloaded, 172 frames extracted, even the 920s long take finished in a few seconds thanks to
  seek-based extraction), and verified `assemble` end to end with a hand-written moments.json (both
  the successful-assembly and validation-failure paths confirmed).
- `@cuesheet/bridge`: MCP server (get/update). Confirmed Claude Code connection and cuesheet reads
  via a smoke test. 4 tests passing.
- `@cuesheet/web`: hand-editing editor (promoted from a viewer). Project settings, subtitle style,
  segment editing (in/out/speed/volume/subtitle, add/delete/reorder), BGM editing. Vite middleware
  serves `/api/cuesheet` GET+POST (save, validated with `validateCueSheet`, errors shown as
  `field-path: reason`), `/clips/*` serves clips statically, and selecting a segment plays only its
  in-out range back via `<video>`. `fs.watch` detects external changes (bridge or direct edits) and
  auto-refreshes via an HMR event.
  **Render-execution button** added: `POST /api/render` reads the cuesheet saved on disk and reuses
  `@cuesheet/render`'s `buildRenderPlan` as-is to run ffmpeg synchronously (produces
  `out/<sanitized-project-name>.mp4` at the repo root), downloadable via `GET /out.mp4` (kept as a
  stable alias for the last completed render regardless of project name). The button is disabled while dirty (unsaved), a
  concurrent request during an in-progress render is rejected with 409 (a module-scoped flag, no
  queueing), and on failure an ffmpeg stderr summary surfaces in the error banner (cuesheet
  validation failures and ffmpeg failures are both unified as `{ok:false, error:string}`).
- `@cuesheet/render`: `buildRenderPlan` generates the ffmpeg command (trim/speed/scale+fps/drawtext
  subtitles -> concat; bgm goes through adelay+volume then amix), executed via the CLI
  (`cuesheet-render`). 8 tests passing. Verified end to end with real clips (`media/clips/cut_01.mp4`
  + `cut_02.mp4`) — produced a 1920x1080/30fps/13s mp4, subtitle frames confirmed too. **Note**:
  macOS Homebrew's default `ffmpeg` is missing drawtext (freetype/fontconfig), so a cuesheet with
  subtitles needs the `brew install ffmpeg-full` binary on `PATH` (see the render README; this
  machine's `~/.zshrc` already reflects this).
- Starter cuesheet `project.cuesheet.json` is seeded; `clipDir` is the repo-local `media/clips`.
- **Environment note**: the supply-chain minimumReleaseAge policy can temporarily block `pnpm
  install` (clears after time passes) — if blocked, run `tsc`/`vitest` directly in each package
  folder to verify. Re-verified with a proper `pnpm install` after the 2026-07-06 policy lift: the
  `pnpm-lock.yaml`/symlinks manually wired during the blocked period exactly matched the proper
  resolution (0 diff), all packages passing typecheck 5/5 and tests 26/26.
- **Measured and cross-verified against 2 real raw episodes (2026-07-05, see
  `docs/ideas/claude-real-video.md`) — scene-detection-based highlight extraction is confirmed
  fully unsuitable for this material.** In knitting long takes (Lowkey 17min / Dotmix 28min, both
  4K), ffmpeg scene scores peaked at 0.090/0.091 — zero detections not just at the standard
  threshold but even at 0.1 (reproduced across both episodes). Decisively, in Dotmix the top scene-
  score points (all hand motion blur) and the actual, visually-identifiable highlights (a cat
  appearing, an object appearing, posture/knitted-shape changes) **didn't match at all** — the
  highlight points don't even clear a 0.02 threshold.
  → **crv not adopted + low-threshold motion-event signal also dropped.** Confirmed direction:
  **seek-based (`-ss` before `-i`) fixed-interval frame extraction (takes seconds; a full-decode
  scene pass would be an unnecessary ~10 minutes for a 29-minute video) + a coarse-to-fine search
  where Claude Vision looks at frames to find change points** (sweep at 60s intervals, then binary-
  search more finely only in ranges that show change). The first smoke test (transcript-based) was
  invalid due to a premise error.
- **Secured 2 real edited answer keys**: reverse-engineered Lowkey (final 4:29, 83 subtitle cues) and
  Dotmix-best (final 5:29, 100 subtitle cues) — **average subtitle duration is essentially identical
  at 2.94s/2.95s**, coverage 90.6%/89.8%, one subtitle line = one cut, direct subtitle-to-screen
  correspondence (confirmed by manual sampling across the board), cat subtitle <-> cat shot,
  product/finished-object reveal <-> still-object shot, big subtitle-free gaps ≈ chapter
  transitions. Speed (motion-blur) cuts are rare (Lowkey 2/29, Dotmix 0/30). Dotmix also has advanced
  elements like PIP comparison inserts and outdoor B-roll (outside what the current schema can
  express — out of scope for now). Raw footage is ~50 clips per episode, mostly evicted to iCloud
  (Lowkey 34/52, Dotmix 39/52) — checking `blocks=0` via `stat -f %b` before reading is mandatory
  (reading a placeholder hangs forever).
- **Rough-cut pipeline prototype succeeded (2026-07-05)**: with 12 local Dotmix raw clips (including
  a 28-minute long take), the full workflow — "frame extraction (Haiku, seek-based) -> vision
  highlight detection (Sonnet) -> cuesheet assembly + validateCueSheet -> real render via the
  existing @cuesheet/render" — passed end to end. Output: a 22-segment/76-second draft (repo-root
  `proto_dotmix.cuesheet.json` + `proto_draft_dotmix.mp4`, memo subtitles burned in). Scored against
  the answer key: 82% of draft cuts (18/22) matched or resembled the user's real edit, recalling 44%
  (7/16) of the coverable real-edit cues. Improvements for v2: recurse the long-take coarse-to-fine
  down to 1-2 seconds (this run used a 60s grid, so `in` points had up to 25s of error), self-verify
  in-frame-vs-memo consistency before finalizing a segment, re-run with all 52 clips after fully
  downloading the iCloud originals.
- Next candidate (excluded from this cycle): schema expansion (transitions/fades, etc.) — the
  default policy is "when there's an edit we can't express, that's when we grow schema+bridge
  tools."
