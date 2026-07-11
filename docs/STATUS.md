# STATUS — Living Status Document

> This document is the single entry point for "where things stand right now, and what exists
> for what purpose." Rule: update this document at every milestone and commit it to git.
> Detailed design rationale and decisions live in the linked documents; this one holds only
> the map. (Last updated: 2026-07-11)

## North Star

**"A personal, fully-tailored video editor"** — throw in raw footage and (1) a rough cut is generated
automatically, (2) polish it in the browser with video-editor-grade UX, (3) it renders right
there. What sets it apart: it works on footage with no dialogue (vision-based), and it bakes
in the user's own editing grammar. See the "Project" section of CLAUDE.md for details.

## Component map (what exists for what purpose)

| Location | Role | Status |
|---|---|---|
| `packages/schema` | Cuesheet types + validation (contract's center, zod), `.describe()` field docs, mechanical repair hints on failures | Stable. 82 tests |
| `packages/bridge` | MCP server for Claude Code connection (natural-language editing) | Stable. 36 tests. 5 tools (`get_cuesheet`/`update_cuesheet`/`validate_cuesheet`/`get_schema`/`get_capabilities`), structured edit receipts, change-summary diff, `CUESHEET_BRIDGE_READONLY` mode |
| `packages/render` | Cuesheet -> ffmpeg render (CLI + buildRenderPlan, incl. two-pass fallback for captured-frames titles + large HEVC concats) | Stable. 112 tests, verified with real renders (single-pass and two-pass) |
| `apps/web` | Touch-up editor: cut editing, single zoomable-filmstrip trim (TrimStrip), full timeline + BGM drag, proxy playback, export button | Actively evolving. 539 tests. Edit step's 3 columns fit a 13-inch laptop; recolors entirely from the active Astryx theme (stone/y2k/neutral switcher) |
| `packages/draft` | **Core**: raw footage folder -> automatic rough-cut cuesheet generation (CLI `cuesheet-draft`: scan for inventory + frame extraction -> assemble for assembly; vision judgment handled by Claude) | Promoted to a proper package. 44 tests (incl. `--json` envelope contract tests), scan/assemble E2E verified against a real footage folder |
| `media/proxies/` | 720p H.264 proxies for web preview (auto-generated, git-ignored) | Automatic |
| `media/dotmix_src` | Symlink to the user's raw footage folder (git-ignored) | — |
| `proto_dotmix.cuesheet.json` | v1 auto-generated rough-cut sample (based on 12 local dotmix clips) | Verified |
| `docs/goals/` | Per-goal specs (contracts) and completion verification records | — |
| `docs/ideas/claude-real-video.md` | crv evaluation -> not adopted, rationale + measurements + own pipeline design decision process | Closed |

## Key decision log (why things were built this way)

- **Scene detection excluded, vision is the only signal**: measured on two real episodes (scene score maxed at 0.09) — see `docs/ideas/claude-real-video.md`
- **Video-first flow**: build the rough cut first, subtitles later (user's decision) — script alignment is a future option
- **User editing grammar constants**: cut average 2.9s, finished length 4:30-5:30, coverage ~90%, shot vocabulary (hand closeup/object/cat/reveal/wearing) — reverse-engineered from 2 real edits
- **Proxy playback**: original 4K HEVC can't play in-browser -> 720p H.264 proxy for preview, render uses the original
- **iCloud rule**: must check `stat blocks=0` before reading source footage (reading a placeholder hangs forever), manage space with `brctl download/evict`
- **AI-legibility as its own backlog**: a dedicated survey (wiki "AI-Legible System Design", covering astryx internals + shadcn/Stripe/GitHub/Cloudflare/Vercel/Storybook/v0) found the missing layer is turning CLAUDE.md's prose conventions into scripts that fail when broken, not more documentation — motivated `check:repo`, CI, `.describe()`-driven `get_schema`, `get_capabilities`, and the AGENTS.md smoke test (issues #5-#16)

## 2026-07-11: UI overhaul — consume Astryx as a design system, not a widget bin

A day-long pass that turned Astryx from a widget library we hand-fought into an actual design
system. Motivating realization (user): we had used Astryx for isolated widgets (Button/Slider)
while re-inventing its composition layer (Field/FormLayout/Section/Grid/EmptyState) by hand,
because Astryx's AI layer was never wired into the repo — so builders didn't know the catalog
existed. Fixes, in order:

- **Design charter** (`docs/design-principles.md`): six binding UI principles — intuitive (follow
  conventions, never invent), hierarchy = actual importance, remove unnecessary information and
  decoration, stock Astryx components, minimal whitespace (13-inch first), structure matches flow.
  Referenced from CLAUDE.md. Ambiguous UI calls resolve against it in order.
- **Astryx AI layer wired in**: the component/template catalog cheat sheet is injected into
  CLAUDE.md (`astryx agent-docs`, between `ASTRYX:START/END` markers), so builders discover the
  composition layer instead of re-rolling it. Run `astryx` CLI from `apps/web/`, not the root.
- **Full color-token migration**: 63 custom color variables -> 0. The app now recolors entirely
  from the active Astryx theme. **Theme switcher** added (stone / y2k / neutral) — verified that
  switching recolors background, tags, buttons, chips across the app (stone grey vs. y2k lavender/
  lime confirmed by screenshot).
- **styles.css 879 -> 275 lines**: form inputs, sections, card grids, and empty states moved to
  stock Astryx `Field`/`FormLayout`/`Selector`/`Section`/`EmptyState` + component-owned StyleX.
  What remains is legitimate domain-custom layout (video/subtitle overlays, the Scenes card grid,
  and the Cut-settings `.qf-*` field grid) — all fully token-driven, no hardcoded values.
- **Count badges fixed**: Scenes tab shows candidate selection (in-use / total), Edit tab shows
  subtitle fill (filled / total) — previously both showed final-cut totals.
- **Structure/polish** (this session): a **Source folder (clipDir) relink field** in Export ->
  Project settings (moving footage no longer silently breaks every cut with no way to fix it in
  app); Collapsible trigger labels scaled to secondary hierarchy (`Text type="label"`);
  `Set In/Out here` -> **`Mark In`/`Mark Out`** (Premiere/FCP convention, denser); the Scenes
  category + status filters consolidated onto **one row**.
- **Deferred (flagged for review)**: migrating the Cut-settings `.qf-*` grid to Astryx
  Field/FormLayout would push styles.css lower, but its rows deliberately pack IN+OUT and
  speed+volume two-up for 13-inch density; a naive vertical FormLayout regresses that. Left as a
  scoped follow-up rather than a blind core-surface change. `apps/web`: 539 tests.

## 2026-07-10 late evening: QA sweep fixes + MIT license

- **QA sweep** (direct fixes, no new feature): inline in/out error surfaced on the Range group's
  Length readout instead of only in a toast; an undecodable video file (corrupt/unsupported
  codec) is now distinguished from a genuinely missing one in the error banner; the face-policy
  banner wraps instead of clipping mid-word; a newly selected clip no longer gets paired with a
  stale debounced thumbnail timestamp left over from the previous clip; cut-list row subtitle
  textareas clamp to 2 lines instead of growing the row. A sixth item from the same sweep, BGM
  gutter bar alignment with covered rows' actual positions, shipped separately as **PR #17**
  (merged) rather than as part of these direct commits.
- **MIT license added**: root `LICENSE` file (`Copyright (c) 2026 let-sunny`) plus a `"license":
  "MIT"` field in every package manifest (root + all 4 packages + apps/web) — verified present in
  all 6 `package.json` files.
- `pnpm -r test`/`typecheck` and `pnpm check:repo` green after this round.

## 2026-07-10 evening: hook extraction round (App.tsx + CompactSegmentList)

- **Goal**: continue pulling untested inline logic out of components into unit-testable modules,
  per the "testability as the size limit" convention — no behavior change in any of these three.
- **`useShuttle`** (`apps/web/src/hooks/useShuttle.ts`): `SequencePlayer` had its own inline copy
  of `VideoPreview`'s J/K/L shuttle (speed ladder + approximate reverse playback), drifting out of
  sync with it. Parameterized the shared hook (video-slot indirection via `getVideo`, a
  configurable reverse floor/forward-snap, `onReset`/`onStop`/`onBackwardStart` extension points)
  so both consumers share the same rAF/level-ladder mechanics while keeping their own bookkeeping
  (preload-slot swapping, user-rate multiplier, playing state) as thin call-site glue.
- **`useProjectResources` + `useRenderExecution`** (`apps/web/src/hooks/`): split ~90 lines of
  `App.tsx`'s inline fetch effects (moments/clipDurations, narration files, bgm files) and
  render-execution logic (poll loop, no-burn-subtitles toggle, `handleRender`) by concern, each
  unit-tested with mocked `api.ts` calls.
- **`bgmTrackDrag.ts`** (`apps/web/src/lib/`): extracted the BGM gutter's pointer-drag math
  (start/extend range computation, row resolution from pointer Y) out of `CompactSegmentList` into
  a pure module (`startBgmDrag`/`extendBgmDrag`/`resolveRowIndexFromBounds`) with dedicated unit
  tests — this logic previously had zero unit coverage despite a real drag-reliability bug history
  (BGM gutter alignment, see PR #17 above).
- `apps/web`: 511 tests passing; `pnpm --filter @cuesheet/web typecheck`/`test` green.

## 2026-07-10: AGENTS.md operator-doc diet + wiki index + smoke test (issues #14, #16)

- **Operator-doc diet (issue #14)**: compressed the per-feature paragraphs issues #9-#13 (edit
  receipts, validate diff, read-only mode, `get_capabilities`, schema feature list) had added to
  AGENTS.md into the bridge tool table plus one-line pointers at the now-live discovery surfaces
  (`get_capabilities`, `get_schema`), instead of restating their output in prose. AGENTS.md:
  262 -> 162 lines; the workflow spine (tool table, CLI invocations, typical edit loop, file
  conventions) is untouched. Issue #14 also added a curated **Wiki-Index page** (GitHub wiki,
  topic-grouped page discovery) alongside a new "AI-Legible System Design" research page — the
  survey behind this whole backlog (see the new key-decision-log entry above).
- **Smoke test (issue #16)**: `scripts/checks/check-agents-doc.mjs` (wired into `check:repo`)
  parses AGENTS.md for its code-ish surfaces — fenced CLI invocations, the bridge tool table,
  backtick-wrapped HTTP endpoints, `CUESHEET_*` env var spans — and executes/asserts each instead
  of trusting the prose: runs a real `scan -> assemble -> cuesheet-render` pipeline against one
  synthetic clip proving `--json`/`--fps`/`--width`/`--height`/`--config`/`--boundary-pad` actually
  change output; every other documented flag is checked against "is this flag still read in
  source"; bridge tool names are matched 1:1 against the doc's table; HTTP endpoints are checked
  statically against `routes.ts`. Parsing anchors on code-ish tokens only, so prose rewording never
  trips it — verified against real drift by temporarily renaming a bridge tool and a CLI flag
  (both caught, then reverted).
- `pnpm check:repo` green (6 checks incl. this one); `apps/web` and bridge suites unaffected.

## 2026-07-10: component scaffolding generator (issue #15)

- **Goal**: make the component anatomy convention (CLAUDE.md "Component layering": one folder per
  significant component - `Component.tsx` with a role header + co-located `Component.styles.ts`
  (StyleX) + `Component.test.tsx` + `index.ts` export gate) machine-executable instead of
  hand-followed, mirroring how issue #6's `check-component-anatomy.mjs` machine-enforces it.
- **What was built**: `pnpm new:component <Name> [--dir apps/web/src/components]`
  (`scripts/new-component/new-component.mjs`) scaffolds `<dir>/<Name>/` from committed templates
  (`scripts/new-component/templates/component/`, astryx pattern - templates as files, not string
  literals) substituting `__NAME__`/`__TEST_ID__` placeholders. Pure template logic
  (`validateComponentName`, `generateComponent`) lives in `scripts/new-component/lib/component-
  template.mjs`, PascalCase-validated and refusing to overwrite an existing folder. Root-element
  `data-testid` is the kebab-case form of the name (matches the existing convention, e.g.
  `crop-edit-overlay`, `bgm-settings-panel`); the generated test does a `render` +
  `getByTestId` smoke check per CLAUDE.md's data-testid-only test-selection rule.
- **Verified out of the box**: generated a scratch `ScratchProbe` component, then ran (against the
  untouched generated output, no edits) `--filter @cuesheet/web typecheck` (clean),
  `vitest run` on the generated test (1/1 passing), and `pnpm check:repo` both unstaged
  (component-anatomy check walks the filesystem regardless of git status) and staged (proves
  check-language/check-no-emoji also pass against the actual generated file content) - all green.
  The scratch component was then deleted, never committed.
- **Tests**: `scripts/new-component/test/component-template.test.mjs` (9 cases: name validation
  accept/reject, all four files written with placeholders fully substituted, testid/index.ts
  content, refuses an existing folder, refuses an invalid name before touching the filesystem).
  Wired into the root `vitest.config.ts`'s `include` alongside `scripts/checks/test/`.
  `npx vitest run` at repo root: 6 files / 37 tests passing (was 5/28 before this issue).
- **Docs**: CLAUDE.md's "Component layering" section now points at the generator as the anatomy
  convention's executable path.

## 2026-07-10: capability manifest via `get_capabilities` (issue #13)

- **Goal**: a single discovery surface answering "what can an AI do with this system" — bridge
  tools, CLI entry points, and expressive cuesheet schema features (title cards, transitions,
  ducking, style presets, timelapse speed, etc.) each with a one-line description and, for schema
  features, a minimal valid cuesheet snippet — so an agent doesn't have to reconstruct the list by
  reading source (per issue #7/#3's `.describe()` docs landing first).
- **Live vs. committed decision**: served live via a new `get_capabilities` bridge tool, not
  committed as a `capabilities.json` artifact — same precedent as `get_schema`. Since nothing is
  written to the repo, there is no separate file that can go stale, so no new `check:repo` check
  was needed (the drift risk that *does* exist — a hand-authored example snippet no longer
  validating after a schema change — is caught by a test, per the issue's own note, not a repo
  check).
- **Single-source construction**: `packages/bridge/src/capabilities.ts` (`buildCapabilities`, pure,
  no I/O). `tools` is populated in `server.ts` from each tool's own already-registered
  `{name, description}` (read back via the `RegisteredTool` handle `registerTool` returns, not
  retyped) — covers all five tools including `get_capabilities` itself. `clis` only references the
  AGENTS.md CLI surface section and each CLI's own `--json`-envelope-pinning test
  (`packages/draft|render/test/cli.test.ts`, issue #8) rather than restating their contract.
  `schemaFeatures[].description` is read directly off the same zod schema objects `get_schema`
  serves (e.g. `segmentSchema.shape.title.description`) — a `.describe()` edit in `schema.ts` is
  reflected here automatically, no third copy of the wording. `schemaFeatures[].example` is the one
  hand-authored part (8 features: title cards, fade/dip transitions, episode-level fades, subtitle
  style presets, BGM ducking, timelapse speed, crop, subtitle background box).
- **Tests**: `packages/bridge/test/capabilities.test.ts` (5 cases — tools pass through unchanged,
  CLI entries reference AGENTS.md, schema-feature descriptions match the live schema text, every
  example validates via `validateCueSheet` [drift guard], the issue's named features are all
  present) + `server.test.ts` gained one new `get_capabilities` round-trip case, now expects 5
  tools (not 4) in both the normal and read-only `tools/list` checks, and the existing
  read-only-mode grounding-tools case now also asserts `get_capabilities` stays usable there (a
  read/grounding tool, same as `get_schema`).
  AGENTS.md updated: `get_capabilities` added to the tools table, a new paragraph describing its
  shape, and the "beyond the basic fields" paragraph now points to it for the per-feature index
  (feeds issue #10's operator-doc-diet intent — future prose trims can point here instead of
  restating detail).
- `packages/bridge`: 36/36 tests passing (was 30). `pnpm -r build`/`typecheck`/`test` and
  `pnpm check:repo` all green repo-wide.

## 2026-07-10: bridge read-only mode (issue #12)

- **Goal**: let an operator attach the bridge in a mode that guarantees `update_cuesheet` never
  writes, for review/demo contexts where natural-language edits should be inspectable but not
  applied.
- **What was built**: `CUESHEET_BRIDGE_READONLY=1` makes `update_cuesheet` refuse every call with a
  structured `{ok:false, errors:[...]}` response naming the env var to unset, leaving the file
  untouched. The tool stays registered (its description is unchanged per-mode, since MCP clients
  may cache `tools/list`) so a caller gets a clear refusal rather than a missing tool.
  `get_cuesheet`, `validate_cuesheet`, and `get_schema` are unaffected — confirmed by
  `server.test.ts`'s read-only-mode case that these three grounding/dry-run tools stay usable.
- `packages/bridge`: part of the 36/36 passing suite; `pnpm check:repo` unaffected.

## 2026-07-10: repair hints on validateCueSheet failures (issue #11)

- **Goal**: where a validation failure has a mechanically computable fix, append it to the
  error string as a `— <hint>` suffix, e.g. `segments[0].speed: speed must be <= 16 — clamp to
  16`. Zero effect on what passes/fails - hints only change error message content.
- **Design**: `packages/schema/src/hints.ts` exports a pure `deriveHint(issue)` that reads a
  single zod issue and returns an optional suggestion string. Two rule families: (1) a generic
  rule for any `too_small`/`too_big` issue with a numeric, INCLUSIVE bound (covers segment
  in/out/speed/volume and, for free, every other clamp-shaped field in the schema - margin,
  opacity, padding, fadeIn/OutS, title/transition durationS, ducking amount/fadeS, bgm volume,
  narration.volume) -> `clamp to <bound>`; exclusive bounds (e.g. `speed > 0`) get no hint, since
  the boundary value itself isn't legal there and there's no clean single value to suggest. (2)
  two schema-specific `custom`-issue rules matched by path+message: project.width/height's "must
  be even" refine -> `round to nearest even (<n-1> or <n+1>)`, and a segment's `in >= out` refine
  when `in > out` -> `swap to in=<out>, out=<in>` (no hint when `in === out`, since swapping
  wouldn't fix it and there's no other mechanical value). Presets/shape errors (wrong type,
  missing key, unknown stylePreset name) are deliberately left alone - matches the issue's "do
  not guess fixes needing human judgment" scope.
- **Wiring**: `validateCueSheet` now calls `safeParse(json, { reportInput: true })` so
  `issue.input` is available to the custom-issue rules (the swap/round-to-even hints need the
  actual invalid value; the generic clamp rule doesn't, since the bound comes from the schema
  itself). `formatIssue` appends the hint after the existing `fieldpath: reason` text, which is
  untouched byte-for-byte - callers matching on that prefix (all three CLIs, the MCP bridge,
  the web save endpoint) are unaffected since none of them assert the full error string exactly,
  only `startsWith`/`toMatch`/`includes` on the reason portion. No consumer code changes were
  needed - bridge/CLIs/web all just forward/join `errors: string[]` as-is, so the hint suffix
  flows through automatically. `ValidationResult`'s shape is unchanged (`{ok:false, errors:
  string[]}`); documented the new suffix convention in AGENTS.md instead of adding a field.
- **Tests**: `packages/schema/test/hints.test.ts` (16 cases, one per rule branch incl. "no hint"
  cases: inclusive/exclusive too_big/too_small, non-numeric bound, width/height even in both
  directions, wrong field, missing input, in/out swap in both outcomes, wrong path, missing
  input, unrelated custom issue, invalid_type, unrecognized_keys) + 5 new integration cases in
  `validate.test.ts` asserting the exact end-to-end string for speed/volume/in-out/width and one
  confirming no hint is added for the stylePreset shape error. `packages/schema`: 82/82 tests
  passing (was 77 before this issue, all pre-existing tests unchanged and still green - none of
  them assert an exact error string). `pnpm -r build`/`typecheck`/`test` and `pnpm check:repo`
  all green repo-wide (bridge 26, draft 44, render 112, web 448 - all unaffected).

## 2026-07-10: bridge change-summary diff on `validate_cuesheet` (issue #10)

- **Goal**: preview what an update would change before applying it. `validate_cuesheet` (the
  existing dry-run tool - no new tool/flag added, per the issue's own scope note) now also
  returns a `diff` on success, comparing the candidate against the currently-saved cuesheet:
  `{durationDeltaS, segments, project, bgm, narration}`. Builds on issue #9's `buildEditReceipt`
  (`packages/bridge/src/receipt.ts`) for the duration figures, so `update_cuesheet`'s receipt and
  `validate_cuesheet`'s diff describe duration the same way.
- **Diff logic**: `packages/bridge/src/diff.ts` (`buildCuesheetDiff`, pure, no I/O). Segments are
  identified by a clip+in/out signature (not raw array index) via a queue-based multiset match, so
  a pure reorder reports as `segments.reordered: true` instead of N unrelated adds+removes; matched
  segments with other fields changed show up as `modified` entries (`{index, clip, changes:
  [{field, before, after}]}`). `added`/`removed`/`modified` segment lists are each capped at 5
  entries independently (`MAX_LISTED_SEGMENTS`) with an uncapped `*Total` count alongside, to keep
  the response within a sane token budget. `bgm` is counts only (`added/removed/modified`, cues
  matched by file+start/end); `narration` is a field-level diff when both sides have it configured,
  or a single whole-object field change when it's toggled on/off. `project` covers
  project.name/fps/width/height/fadeInS/fadeOutS plus clipDir/intro/outro/subtitleStyle/
  subtitleStylePresets, uncapped (small fixed field set). `diff` is omitted entirely when there's no
  currently-saved cuesheet yet to compare against.
- **Scope decision**: per the issue's explicit note ("this issue does not add a new tool or a
  dryRun flag... scope is strictly the diff computation on top of [validate_cuesheet]"),
  `update_cuesheet`'s receipt is untouched - the diff lives only on the dry-run path.
- **Tests**: `packages/bridge/test/diff.test.ts` (12 cases: no-change, added/removed/modified
  segment, reorder true/false, the 5-item cap, project field changes, bgm counts, narration
  add/change/no-op) + 2 new `server.test.ts` round-trip cases (diff omitted with no saved baseline;
  diff reports 2 removed segments + 1 added BGM track against a saved cuesheet, matching the
  issue's own worked example). `packages/bridge`: 26/26 tests passing; `pnpm -r
  build`/`typecheck`/`test` and `pnpm check:repo` all green repo-wide.

## 2026-07-10 morning: AI-legibility foundation batch (issues #5-#9)

Five commits landed back-to-back this morning (08:16-09:28), each closing one issue from the
AI-legibility backlog and each a prerequisite the afternoon's bridge/schema work (repair hints,
`get_capabilities`, the read-only mode, the operator-doc diet — see their own sections above)
built on:

- **CI workflow (issue #5)**: minimal GitHub Actions workflow (`.github/workflows/ci.yml`) runs on
  push to main and on pull request — `pnpm install --frozen-lockfile`, `pnpm test:checks`,
  `pnpm -r build`, `pnpm -r typecheck`, `pnpm -r test`, then `pnpm check:repo` last (it imports
  `packages/schema/dist`, so it must run after Build). Installs `ffmpeg` via `apt-get` first, since
  `packages/render`/`packages/draft`'s test suites spawn a real ffmpeg/ffprobe binary
  unconditionally and `ubuntu-latest` doesn't ship it — a deliberate deviation from the issue's own
  suggestion to skip those tests in CI, verified rather than assumed.
- **`check:repo` suite (issue #6)**: five node scripts under `scripts/checks/` (language, emoji,
  component-anatomy, test-selector, schema-examples — a sixth, agents-doc, was added later the same
  day by issue #16, see above), each backed by a pure/testable matcher in `scripts/checks/lib/`
  with vitest coverage against fixture trees. `pnpm check:repo` chains all of them; `pnpm
  test:checks` runs their own unit tests. This is the script that makes this very refresh's
  language/emoji conventions machine-checked rather than self-reported.
- **Schema `.describe()` docs (issue #7)**: every field across
  project/crop/subtitle-style/title/transition/segment/bgm/ducking/narration in `cueSheetSchema`
  now has a `.describe()`, sourced from the render/draft code paths that actually consume each
  field — so the bridge's `get_schema` tool (previously shapes/types only) now tells an agent that
  `in`/`out` are source-clip seconds, that `segment.clip` is a filename resolved against `clipDir`
  while `bgm.file`/`intro`/`outro` are direct paths, that `speed >= 8` reads as a timelapse cut, and
  the subtitle style merge order — without needing to read AGENTS.md prose the bridge never
  surfaces. Zero validation-behavior change.
  `packages/schema/test/jsonSchemaDescriptions.test.ts` walks the generated JSON Schema and fails
  if any property is missing a description (self-enforcing for future fields).
- **CLI `--json` contract tests (issue #8)**: extended the existing subprocess CLI tests
  (`cuesheet-draft`/`cuesheet-render`) to assert the exact documented key set (not just a subset)
  for scan/assemble/render success envelopes, plus failure-path coverage (invalid `moments.json`,
  invalid cuesheet) asserting exit 1, a `field-path: reason` line on stderr, and no stdout JSON —
  matching AGENTS.md's documented contract.
- **Bridge structured edit receipts (issue #9)**: `update_cuesheet`'s success response used to be a
  bare `"Saved"` string. It now returns `{ok:true, receipt:{segmentCount, durationS, warnings}}`
  computed from the cuesheet that was just validated and written (ground truth, not the caller's
  input), mirroring the `--json` receipts the CLIs already emit. Receipt-building lives in its own
  pure module (`packages/bridge/src/receipt.ts`) so the later change-summary diff (issue #10, see
  its own section above) could reuse it instead of duplicating "describe a cuesheet" logic.
- All five: `pnpm -r build`/`typecheck`/`test` and `pnpm check:repo` green (schema 82, bridge 36 at
  the time, draft/render's CLI suites extended in place).

## 2026-07-10 early morning: StyleX migration batch 5 complete (closes issue #3)

- **Batch 5 migrated the remaining large components to full component anatomy** (folder +
  co-located `.styles.ts` + co-located `.test.tsx` + `index.ts`, per CLAUDE.md "Component
  layering"): `VideoPreview` + `CropEditOverlay`, `MomentPalette`, `SequencePlayer`,
  `MiniTimelineStrip` - then a wiring commit folded `App`'s own container rules into
  `App.styles.ts`, and a cleanup commit deleted every `styles.css` rule migrated or made dead this
  batch (shared tokens, documented cascade/specificity exceptions, and earlier-batch carryover are
  all that remain).
- **Verified reduction**: `styles.css` was 2154 lines at the start of the whole StyleX migration
  (before batch 1); this batch alone took it from 1687 to 1110 lines (confirmed via `git show` at
  each boundary commit). It currently sits at 1122 lines net of small subsequent changes (e.g.
  TrimStrip's own cleanup removed 84 more lines the same day - see below).
- Closes issue #3 ("Restructure packages/web: components are flat in one app and some files are
  too large") - the StyleX mass-migration this issue tracked, deferred earlier in the week pending
  a recipe (StepNav as the 0-pixel-diff exemplar, TitleOverlay as the new-component-anatomy
  exemplar - both documented 2026-07-09), is now finished across all 5 batches.

## 2026-07-10: two-pass render fallback (captured-frames title + large HEVC concat deadlock)

- **Bug**: the demo bisection found combining a captured-frames title overlay (gooey/melt/particle -
  see the 2026-07-09 title-cards entry below) with a concat of 10+ HEVC clips in one
  `filter_complex` reproducibly deadlocked ffmpeg (hangs forever, no error) - fewer clips or no
  titles rendered fine. Suspected cause: filter-graph buffer starvation from many demuxed inputs
  plus an overlay branch feeding `concat` (a distinct, more severe case than the 2026-07-09
  "3+ titles in one render" deadlock, whose fix - forcing `-filter_complex_threads 1` - stays in
  place for that narrower case but wasn't trusted to also cover this one).
- **Fix: two-pass render**, added to `buildRenderPlan` (`packages/render`) - dispatches
  automatically, no caller-visible new function. Pass 1 renders the base cut (concat/trim/speed/
  subtitles/audio, everything unchanged from before) to a near-lossless intermediate
  (`libx264 -preset veryfast -crf 10`, colocated next to the output as
  `<name>.pass1-intermediate.<ext>`, not auto-deleted - same precedent as `media/title-cache/`,
  costs meaningfully more disk than a normal delivery encode). Pass 2 takes that ONE intermediate
  as its sole input and chains an `overlay` per captured-frames title at its absolute output-
  timeline offset (`setpts=PTS+offset/TB` then `enable='between(t,offset,offset+durationS)'` - the
  same idiom `adelay` already uses for audio elsewhere in this package) - one real decode + N
  small PNG-sequence inputs chained sequentially, structurally the same shape as the demo's
  already-working "solo title" render, so it never re-enters the deadlocking shape. An ASS-based
  "typing" title (no extra ffmpeg input, no overlay branch) was never implicated and always stays
  in pass 1 unconditionally.
- **Threshold**: `TWO_PASS_INPUT_THRESHOLD = 10` total concat inputs (segments + intro + outro),
  gated on at least one captured-frames title being present. **Not bisected against a live repro**
  in this environment - an extensive attempt (12-100 synthetic HEVC clips, 720p through 4K, 1-8
  captured-frames titles with/without backdrop dim, with the existing `-filter_complex_threads 1`
  mitigation both present and stripped) never reproduced a hang on this machine's ffmpeg build
  (8.1.2). The original demo bisection used real 4K HEVC raw footage (not committed to this repo,
  evicted to iCloud) - the deadlock is plausibly sensitive to real decode-timing variance that flat
  synthetic clips don't have. The threshold is set directly from the demo's own given fact ("10+
  HEVC clips" deadlocks, fewer is fine) rather than invented; **follow up with a real-footage
  validation run if the deadlock resurfaces at a different count.**
- **Shared offset math extracted**: `computeSegmentOutputTimings` (`packages/render/src/timeline.ts`,
  new, unit tested) replaces what used to be two independent, hand-duplicated copies of the same
  cumulative-(out-in)/speed-sum loop (`plan.ts`'s narration placement, `ducking.ts`'s
  `deriveDuckingWindows`) - both now call the one shared function, and pass 2's title placement
  reuses it too.
- **API compatibility**: `RenderPlan` gained an additive `commands: RenderCommand[]` field (one
  entry for a single-pass cuesheet - the overwhelming majority - two for a two-pass one); `args`/
  `filterComplex`/`outputPath` stay as before for single-pass (byte-identical, regression-tested)
  and are DERIVED from pass 2 (the final pass) when two-pass triggers - a caller that only reads
  `args` directly (rather than running every entry in `commands` in order) gets a fast, clear
  ffmpeg error (missing intermediate input) instead of silently shipping a video with no titles.
  **Follow-up resolved same morning**: `apps/web`'s `POST /api/render` route was flagged here as
  still running `buildRenderPlan`'s top-level `args` directly (which fails fast on a two-pass
  plan's missing intermediate) - fixed at 08:02 the same morning: the route now iterates
  `plan.commands` in order, giving each pass an equal progress slice
  (`overallRenderProgress` in `server/shared.ts`, unit-tested) and prefixing ffmpeg error summaries
  with the failing pass's label.
- **Verified**: `pnpm --filter @cuesheet/render typecheck`/`test` green (112 tests, up from 89 -
  21 new: `timeline.test.ts`, `twoPass.test.ts`, plus new dispatch cases in `plan.test.ts`).
  End-to-end: a real two-pass render (12 synthetic HEVC 720p clips + 1 gooey title) completed in
  ~6.5s total (pass 1 2.5s, pass 2 4.0s) and the title was confirmed visible only inside its
  [0s, 2s) window (frame-extracted and inspected at t=1 vs t=5). The existing CLI's single-pass
  path (`project.cuesheet.json`, no title) re-verified unaffected (13s output, matching the
  earlier real-render figure).

## 2026-07-10 morning: 13-inch density fit for the Edit step

- **Bug**: the cut list, video, and cut settings columns wrapped below one another below ~1480px
  total width, leaving the cut settings panel effectively invisible on a 13-inch MacBook until
  scrolling past the whole video block.
- **Fix, via arrangement (not scaling type/spacing or restyling Astryx components)**:
  `CompactSegmentList`'s cut list column narrows 480px -> 300px, moving the row's time
  range/style badge/subtitle dot/reorder+delete actions onto their own line below the subtitle (a
  two-line list-row convention matching Premiere's/Resolve's bin rows); `EditStep`'s cut settings
  column narrows from a flexible 424-440px to a fixed 344px; the video column keeps its 480px min
  and claims the freed-up width via its existing `flexGrow`.
  New `useStickyColumnMaxHeight` hook (`apps/web/src/hooks/`) fixes the cut settings column's
  `max-height` calc, which had assumed the sticky workspace was already pinned to its stuck `top` -
  true only after scrolling past its natural position, so landing on the Edit step (the common
  case) left the column's bottom below the fold even though the cap looked right on paper; it's now
  computed from the column's actual measured offset.
  `HeaderBar`'s Undo/Redo/?/Save/Export buttons take `size="sm"` (an official Astryx variant).
- `docs/screen-spec.md` now records 1280x800/1440x900 as this app's baseline viewports and the new
  column-width tokens. Also fixed `tests/e2e/journeys/bgm-track.spec.ts`: raw `page.mouse`
  coordinates don't auto-scroll like locator actions do, so the taller cut list rows pushed row 4+
  outside the default 720px-tall test viewport, landing drags on the wrong row - targets are now
  scrolled into view first.

## 2026-07-10: astryx contribution status update

- **PR #3738 merged** (`fix(core): forward rest props (data-testid) to CheckboxInput's native
  input`) - the gap CLAUDE.md's data-testid convention already flags (`CheckboxInput` declares the
  same `BaseProps` type as `Button`/`Tab`/`Slider` but its implementation destructures a fixed prop
  list with no `...rest` capture, so a `data-testid` passed to it was silently dropped).
- **#3743** (fix Toast fallback viewport's theme mode instead of OS preference) and **#3660** (make
  `theme-build` color-scheme decl mode-aware) both still open/in review upstream - unchanged from
  their prior status, re-confirmed via `gh api` rather than assumed stale.

## 2026-07-09 late evening: TrimStrip (single zoomable filmstrip replaces two-level trim)

- **Why**: the previous two-level trim (an overview bar + a separately-zoomed detail bar) read as
  an uninteractive blue box in user testing and was judged unintuitive - per the repo's
  no-invented-UI-patterns rule, replaced with the researched convention from
  `docs/research/trim-ux-conventions.md` section 4: one filmstrip.
- **`TrimStrip`** (`apps/web/src/components/TrimStrip/`, new anatomy component): one strip of
  `SegmentThumb` tiles (ruler-tick fallback per cell while thumbs load/are unavailable) with the
  existing in/out drag handles + playhead overlaid on top, a zoom control row (-/Fit cut/Fit
  clip/+), Ctrl/Cmd+wheel zoom pivoting on the cursor, Shift+Z fit-clip reset, and a
  scrollbar-styled pan control (thumb body pans, thumb edges resize/zoom) that only appears once
  zoomed in, with an always-visible min-2px cut tick. Viewport zoom/pan math lives in
  `lib/trimWindow.ts`, time-field precision helpers in `lib/timeInput.ts` (both pure, unit tested).
  `SegmentThumb` gained an optional `onResult` callback so consumers can detect load
  success/failure per thumbnail.
- **Wired into `VideoPreview`**, dropping the old two-level trim entirely (removed the dead
  `.scrub-*`/`.trim-overview*` rules from `styles.css`); `MIN_GAP_S` moved from a private
  `VideoPreview` constant to the shared `trimWindow.ts`. Also wired `project.fps` into
  `SegmentQuickFields` so the In/Out fields' Up/Down frame-nudge is never hardcoded, and switched
  those two fields from `type="number"` to `type="text"` - a native number input silently
  sanitizes anything that isn't plain float syntax back to `""` (no leading `+`, no `:`), which
  would have eaten the `M:SS.s`/relative-entry shorthand before `useNumericField`'s parser ever saw
  it (caught by a failing unit test, not by inspection).
- `docs/screen-spec.md` section 3 rewritten around TrimStrip; new Playwright E2E journeys added
  (short-clip default view, long-clip zoom/drag/keyboard) with fixture clip filenames prefixed to
  stop colliding with the real project's proxy cache.

## 2026-07-09: named subtitle style presets + title cards (PRD backlog #1+#2)

- **Schema (additive-only)**: `subtitleStylePresets?: Record<name, subtitleStyleOverride-shape>`
  at the cuesheet level, `segment.stylePreset?: string` (cross-validated against
  `subtitleStylePresets` in the sheet-level `superRefine` - a bad reference fails with
  `segments[i].stylePreset: ...`), `segment.title?: {text(1-80), preset:
  gooey|melt|particle|typing, durationS?(0.5-10, default 3), backdrop?: {dim(0-1)}}`. Effective
  subtitle style merge order (render + web preview, kept identical by design): global
  `subtitleStyle` < preset < per-cut `styleOverride`.
- **Render**: `resolveSubtitleStyle` (renamed from `effectiveSubtitleStyle`) implements the
  3-way merge. Title cards: `typing` compiles to an ASS file (per-character `\k` karaoke reveal
  + whole-line `\fad`) wired in via the `subtitles=` filter; `gooey`/`melt`/`particle` headless-
  capture a deterministic `seekAnimation(frame)`-driven HTML animation (Playwright chromium,
  new `dependencies` entry) into a `frame_%04d.png` sequence, composited via `overlay=...
  :enable='between(t,0,durationS)'`. Content-addressed cache under `media/title-cache/`
  (gitignored) keyed by `titleCacheKey(text, preset, durationS, project dims/fps)`.
  `prepareTitleAssets` (async, does all the disk/browser I/O) runs before the now-still-pure/
  sync `buildRenderPlan`, which throws a `segments[i].title: ...` error if an asset wasn't
  prepared - wired into both the CLI and `/api/render`. Backdrop dim renders as a
  `color=black,fade=...:alpha=1,colorchannelmixer=aa=<dim>` layer alpha-composited under the
  title. 50 render tests (up from ~34), including buildRenderPlan wiring tests using fixture
  TitleAsset objects (no live Playwright in the unit suite - too slow/flaky for CI; verified
  separately with real renders, see below).
- **Web**: Export step gains a **Subtitle style presets** section (create/rename/delete, edit
  reuses the same size/color/outline/margin fields as the per-cut override, compact preview
  chip per preset); Cut settings SUBTITLE group (G3) gains a Style preset select above the
  per-cut override; new **G4. Title** group (Cut settings, screen-spec section 4 renumbered
  G4-G7) - toggle, text/preset/duration/backdrop-dim fields. New `components/TitleOverlay/` -
  the repo's first full component-anatomy exemplar (folder + co-located `.styles.ts` +
  co-located `.test.tsx` + `index.ts`, per CLAUDE.md "component layering") - live preview of all
  4 presets (CSS reveal for typing, SVG goo-filter circles for gooey/melt, canvas point-cloud
  for particle), wired into both `VideoPreview` (Edit step) and `SequencePlayer` (Play all).
  150 web tests (up from ~138), incl. 12 new for TitleOverlay. `vitest.config.ts` now also runs
  the `astryxStylex()` Vite plugin so `stylex.create()`-using components can be tested at all
  (this was the first component using both stylex.create AND a test).
- **Docs**: ARCHITECTURE.md (schema/render/web public-surface sections + key-design-decisions +
  pipeline-contracts updated for the merge order, title render paths, and `media/title-cache/`
  contract), screen-spec.md (section 4 G4 Title + renumbering, section 5 Subtitle style presets
  placement).
- **Verification**: `pnpm -r typecheck` and `pnpm -r test` green across all 5 packages (293
  tests total); real ffmpeg renders per preset with 3-timestamp frame evidence, plus UI
  screenshots (light+dark) of the new Cut settings TITLE group and Export subtitle-style-presets
  section. Two real bugs found and fixed during this verification pass (not assumed - both
  reproduced and confirmed fixed via actual renders):
  - **Particle capture race**: the first ~30 of 90 captured frames were byte-identical blanks -
    a `<canvas>` 2D-context draw doesn't itself force the browser to paint/composite before
    Playwright's next screenshot, so the compositor was racing behind the capture loop (SVG-based
    gooey/melt weren't affected - DOM mutations are always in sync with the next paint). Fixed by
    awaiting two `requestAnimationFrame` ticks after each `seekAnimation` call, before the
    screenshot (`title.ts`'s capture loop).
  - **ffmpeg filter-graph deadlock with 3+ captured-frames titles in one render**: combining
    typing+dim, gooey, melt, and particle titles in a single 4-cut cuesheet reliably deadlocked
    ffmpeg's default multi-threaded filter scheduler (CPU flatlines mid-encode, no forward
    progress - reproduced 3 times, isolated to the captured-frames overlay+concat combination by
    testing 2-combo/3-combo/4-combo and with/without backdrop dim). Fixed by adding
    `-filter_complex_threads 1` to the ffmpeg args whenever any segment wires in a captured-frames
    title asset (scoped narrowly - cuesheets without one are unaffected); confirmed the 4-title
    combo renders correctly end-to-end afterward.

## 2026-07-09 daytime: standing QA + structure rounds + table-stakes features (autonomous loop)

- **Standing QA established** (user mandate: detect, don't wait to be told): persona
  walkthrough + adversarial inputs + wrongness screenshot review found 9 real defects in
  one sweep — incl. numeric clear-then-type data corruption (typed 2.5 committed 12.5),
  dialog keydown leak silently mutating cuts, odd-resolution render failure with a
  4000-char error dump. All 9 fixed same day (useNumericField hook, modalStack guard,
  even-dimension refine, wrap guards, scrim fix, frames-root fix).
- **Structure round A**: cuesheet-plugin (~1300L) split into server/{routes,media,watch,
  shared}; web test harness stood up (vitest+RTL); render output moved to
  out/<project-name>.mp4. Found a real bug wiring tests: oversize-upload guard destroyed
  the socket so its 413 never reached clients.
- **Structure round B**: App.tsx 1499→1072 via hooks (useCueSheetHistory/Server/
  KeyboardShortcuts), VideoPreview/SequencePlayer/MomentPalette logic extracted into
  pure tested modules (+105 tests). StyleX mass-migration deferred; recipe established
  later same day (docs/styling-migration.md) with StepNav as the 0-pixel-diff exemplar
  and TitleOverlay as the new-component anatomy exemplar.
- **Features**: named subtitle style presets (global < preset < per-cut merge, validated
  references) + title cards (Gooey/Melt/Particle/Typing + backdrop dim) working in BOTH
  preview and real renders (ASS karaoke for typing; headless PNG-sequence capture +
  overlay for the rest, content-addressed cache). Two render-path bugs found via real
  renders (canvas paint race blanking early frames; ffmpeg filter-scheduler deadlock at
  3+ overlays). Palette card media area now uses the Astryx AspectRatio+Overlay
  composition. Tests: 297 across 5 packages.
- **Astryx candidate verdicts** (dogfooding program): Toast fallback = REAL bug
  (context-severed fallback tree -> invisible toast; distinct from upstream #1586;
  issue draft awaiting user approval). Thumbnail gap = our miss (AspectRatio+Overlay is
  the documented path — adopted). TabList ARIA = real but duplicate of upstream #3335.
- Extras: YouTube chapter prototype from editing-grammar boundaries (4 chapters on v4),
  fades/dip design sketch in PRD, fresh-clone onboarding fixes landed in the morning.

## 2026-07-09 overnight: release-readiness chain (autonomous loop)

- **English everywhere in git (complete)**: history rewritten (106 commit messages
  translated, personal paths scrubbed incl. dash-encoded variants, judgment data purged),
  UI chrome, validation messages, code comments, docs, runtime strings across
  bridge/CLI/server. Remaining Korean = content data, voice-guide examples, test titles
  (pending decision).
- **Privacy**: zero media blobs ever in history (verified); moments/progress/manifest
  untracked + history-purged; SRT outputs untracked (*.srt ignored); Vrew branding
  removed (one competitor-research doc retained as legitimate analysis).
- **Release surface**: README rewritten as the public front door; ARCHITECTURE.md moved
  to root; AGENTS.md + llms.txt added (agent-operated onboarding); bridge MCP expanded
  to 4 tools (validate_cuesheet dry-run, get_schema); CLI --json on scan/assemble/render;
  assembly grammar split into overridable config (defaults unchanged, proven by tests);
  crop aspect lock generalized to derive from project aspect (schema refine + ffprobe
  render check + UI lock).
- **Refactoring audit**: 4 duplication families consolidated; 16 files reordered to the
  code-layout convention (public surface -> protagonist -> helpers), recorded in
  CLAUDE.md; oversized-file split candidates listed for discussion (App.tsx 1404L etc).
- **UX polish from live feedback**: card spacing/no-dimming/badge wrapping, banner
  button hierarchy, read-only clip name, separated Delete zone, Export audit,
  project-name download filenames, intro/outro upload, Save dirty emphasis (proactive).
  Toast inverted theme confirmed as intentional Astryx design.
- Tests: 113 across 5 packages, all green. astryx PR #3660 tidied and review-pending;
  third-party duplicate PR #3690 under watch (ours predates, with tests+changeset).

## 2026-07-08 major overhaul (PRD established + hierarchy realigned + pipeline expanded, autonomous loop)

**Canonical docs established**: `docs/PRD.md` (full feature list, terminology dictionary, state
model, success criteria, error catalog, schema compatibility principle) + `docs/screen-spec.md`
(layout rules: grouping/alignment grid, importance=size, 6 fixed inspector groups). From now on
every feature gets a place in the docs first.

- **UI overhaul (6 commits)**: rearranged every screen per screen-spec + migrated to Astryx
  one-off components (Button/CheckboxInput/Collapsible/Slider; Selector/SegmentedControl next
  round) + **terminology canonicalized** — step names "Scenes/Edit/Export", segment -> cut,
  inspector -> cut settings, render -> export, etc. (PRD section 4 is canonical, confirmed 0
  hits for banned terms via grep). Status copy rewritten per the "situation + next action"
  principle (restore banner, etc.).
- **Crop aspect-ratio lock (no distortion)**: fixed a defect where render stretched the crop
  area to 16:9, squashing vertical crops — locked the crop window's w==h (equivalent to
  preserving aspect ratio in the ratio coordinate space), fixed an expansion bug + added a
  "full frame" button, migrated v4 crops across 7 cuts (re-verified face/content against real
  frames per cut), re-rendered the final set (confirmed the overhead-shot cup now renders as a
  true circle). Also replaced the subtitle outline's text-shadow approximation with a real
  stroke (fixed the splitting artifact), removed hardcoded preview subtitle size (now scales
  proportionally).
- **4K export**: added resolution presets 720p/1080p/4K + proportional subtitle-metric scaling
  on switch (supports the schema's 4K ceiling).
- **One-command episode**: `pnpm episode "<folder>"` (validate + scan + server + browser) +
  `/episode` (instructions covering vision judgment -> assembly -> voice-styled subtitles ->
  crop suggestions -> validation, start to finish).
- **Frogging narrative detection (self-initiated, #1 backlog item)**: compares adjacent frame
  pairs across the timeline (`packages/draft` progress.ts) — in v4 measurement, successfully
  bracketed the known frogging point (clip 033, t200-203), zero false positives in the control
  set, and discovered an unlogged second frogging event (t720). Formally integrated as
  `/episode` step (2.5). 35/35 tests.
- **Monorepo cleanup**: removed 9 dead CSS rules/duplicate logic, refreshed 5 READMEs (added
  bridge's), deleted proto v1/v2/v5, moved the v3 lineage to archive/. Moving SRT logic into
  `@cuesheet/render` (+ CLI `--srt`, byte-identical verification) in progress.
- **Doc system**: confirmed docs=public/research vs. wiki=experiment reports vs. English-only
  policy (CLAUDE.md), finished converting 5 wiki pages to English (removed duplicate H1s),
  synced USER-GUIDE terminology + save mental model, added
  `docs/research/oss-landscape.md` (competitive landscape: draft judged high-value for public
  release) + `docs/release-candidates.md` (public-release candidate triage, pending discussion).
- astryx #3: issue #3658 + PR #3660 moved to Ready for review (CI green, awaiting review).

## Overnight work wrap-up (2026-07-06 night ~ 07-07 early morning, autonomous loop)

- 6 new editor features: async render + progress, main-playthrough continuous playback
  (double-buffer + subtitle overlay), undo/redo (50-deep stack), one-click intro/outro
  assignment, cut/timeline thumbnails (disk-cached), proxy-readiness notice
- 4 integration-walkthrough fixes: playthrough race/hang, Cmd+Z field-undo conflict, cut list
  width
- 2 pipeline items: cut rhythm average converged to 2.8-3.0s, extension-case regression test
- Infra: proxy integrity check (detected & regenerated 18 corrupted proxies, recovered cut 97's
  wearing shot)
- Finished cut (upload-ready, morning of 07-07): proto_final_dotmix.mp4, 97 cuts/5:31 -
  regenerated 37 subtitles in the voice guide's tone + face policy (chin-line rule) crop on
  17 cuts + wearing finale (back view, safety-checked) + 97-cue SRT. Full face audit across
  all 97 cuts (11 violations fixed via crop, 6 borderline cropped, kept the cat "director" gag
  by judgment call).
  Render regression: found and fixed an SAR mismatch across cropped concat segments (setsar=1)
- External: 2 astryx PRs awaiting review, root cause (a regressing commit) found and folded
  back into the frame

## v4 full cycle (morning of 2026-07-07, first full run of the formal pipeline)

- Flow: scan CLI (51 clips/462 frames, 3 min) -> vision workflow (51 agents, 113 moments/22
  face flags, ~15 min) -> assemble CLI (90 cuts/4:37) -> subtitle voice pass (90/90) ->
  director's review (9 violations found and prescribed) -> final set
- Findings: steady-cut average 3.00s (rhythm convergence working correctly, vs. v3's 3.41),
  face policy prevented issues proactively (zero adopted moments violated it), review found a
  connector gap -> added a face guard to assemble (faceExposed + description heuristic)
- Scoring: recall rate 80.0% (up +9.2 from v3's 70.8, on a pure-automation basis) -
  unboxing/outing/progress/finished shots 91-100%, **mistake/frogging narratives at 5.6%
  (1/18) is the biggest remaining gap = #1 backlog item** (needs timeline comparison
  detection), excess cat shots is a matter of taste
- Output: proto_final_dotmix_v4.mp4 (4:34)/_nosub.mp4/dotmixbest_v4.srt (90 cues), server
  switched to v4
- Tooling reliability: saved-field-loss guard (schema's findLostFieldPaths), narration flow UI,
  subtitle styling (background box/color picker/proportional preview/margin), user guide
  docs/USER-GUIDE.md

## Automated/manual audit & editor finishing polish (evening of 07-07)

- Established the principle: **automatic is the default, every automatic decision gets a
  manual override.** Audit found cut/subtitle/speed/style already solid, crop and dropped
  moments were the gaps -> filled same day
- Crop drag-edit UI (overlay + 8 handles + apply/cancel/release + undo), palette
  adopted/rejected badges (adopted 97/face 17/quality 9) + filter + rescue flow (face shows a
  confirmation prompt)
- Per-cut scene description in the edit screen (badge + note, matched on 90/90) - video header
  top / cut settings / list / playback hint
- UX audit: truncation (show full text for important info), size (info text 13px+), hierarchy
  (scene is the first thing seen)
- Verified assemble's face guard (v5 reassembly): confirmed 2 risky connectors auto-excluded,
  expanded the heuristic's body-part vocabulary, made faceExposed mandatory in the vision
  contract (from the next run on). The production copy stays on the already-verified v4.
- Logged remaining limitations: ranges with no description are outside the heuristic's reach
  (to be resolved by the faceExposed contract), overhead-shot face auto-measurement is
  incomplete -> the manual crop UI is the last line of defense

## Editor finishing chain (completed evening of 07-07) - closing out the "nearly done" stage

- Round A: J/K/L shuttle, merge adjacent cuts (Cmd+J), fixed a root-cause single-cut
  play/pause race, sticky Edit-screen layout
- Round B: unified trim + rapid-entry modes (inline subtitles + Tab flow + instant overlay),
  per-cut subtitle style (styleOverride UI + promote-to-global), mini-timeline zoom (thumbnails
  revived), render settings dialog (resolution/subtitles), intro/outro file picker
- Light theme + 3-way toggle (light-dark() variables, worked around an Astryx layer conflict)
- Final usability review (user persona, real Chrome): measured navigation flow (0 hand
  departures across a 10-subtitle Tab flow), 5 fixes (export button off-screen / dirty-state
  contradiction / subtitle field width, etc.), found-fixed-re-rendered 3 remaining face-policy
  violations
- Folded in 4 UX benchmark research pieces (docs/research/): industry-verified the
  subtitle=cut 1:1 structure, confirmed the time-thief automation
- Refreshed outputs: proto_final_dotmix_v4.mp4/_nosub/_v4.srt (fully face-policy-compliant cut)
- Verified 2 astryx contribution candidates (color-scheme layer bug = confirmed upstream,
  gothic preview display gap)
  - Publishing is pending user approval

## In progress / pending

- Re-verified formal install after the pnpm policy lifted (2026-07-06): manual lockfile wiring
  matched the formal resolution, all packages green
- Editor: the 3-step flow (Compose-Edit-Finish, Astryx Stone) complete — passed 5 rounds of
  scenario QA + a real production run
- **Real production run complete (night of 2026-07-06)**: an editor persona used only the
  editor to turn v3's 119-cut draft into a 96-cut/5:27 finished cut (rewrote every subtitle in
  the user's voice, including outro/BGM), then rendered it for real — output
  proto_final_dotmix.mp4 (5:36). Proved the full "raw 3.6-hour footage -> finished cut" path
  completes entirely inside the tool
- External contribution: facebook/astryx issue #3622 + PR #3624 (fixed a missing dark-token
  alpha value in the Stone theme, awaiting review)

## Next candidates (not yet started)

- Full playthrough (async render was completed 2026-07-06 — includes progress/proxy notice)
- Per-segment zoom/crop schema extension (#10) — waiting to confirm what "viewport size"
  should mean with the user
- Third training/verification pass with the lowkey episode (source footage moved back to
  iCloud — re-download if needed)

## Verified figures (2026-07-05)

- **Production-run scoring (night of 2026-07-06)**: 96-cut judgment: exact match 13.5%/similar
  82.3%/mismatch 4.2% (lowest yet), recovered 23 of 30 answer-key shots (76.7%), subtitle
  overlap 61/100, matching narrative-arc structure. Remaining gap: average cut 3.41s (12-17%
  longer than the real 2.95s — pipeline's default rhythm needs adjusting), missed the wearing
  reveal (cause: clip 060's wearing segment wasn't selected — not a footage problem), 4
  leftover subtitle-tone issues + a "고앵이" spelling inconsistency. Creative liberties: the cat
  "director" gag appeared 9 times (not in the original footage, awaiting user's judgment call).

- v1 (12 clips): 22 cuts/76s, real-edit recall rate 43.8% (7/16), all steady speed
- v2 (20 clips): 48 cuts/163s (steady 42 + timelapse 6), **recall rate 77.8% (14/18)**,
  subtitle semantic overlap 23 pairs, self-verification caught 4 memo errors before output,
  confirmed second-level precision on long-take in-points
- **v3 complete pass (all 49 clips, 2026-07-06)**: 119 cuts/6:37 (steady 113 + timelapse 6),
  **knitting-in-progress shots at 47.8%** (successfully addressed the user's feedback "all the
  knitting shots got cut"), 8 cat cuts, self-verification passed 110/memo-corrected 8/removed
  0, recovered 17 of 24 recoverable answer-key shots (out of a possible 80%, 70.8% overall),
  **subtitle semantic overlap 60/100** (sharp rise from v2's 23). Of the 6 missed, 2 (wearing
  shots) even have uncertain source footage existence. Intro/outro candidates auto-flagged.
- Output: repo-root proto_draft_dotmix_v3.mp4 (6:37, final) + proto_dotmix_v3.cuesheet.json,
  showcase data media/drafts/dotmix.moments.json (all 49 clips, 111 moments + 50 knitting
  ranges)
- Remaining improvement ideas: re-search for highlights inside timelapse ranges, have the scan
  stage directly classify user categories (mistakes/outings)
