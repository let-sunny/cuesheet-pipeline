# STATUS — Living Status Document

> This document is the single entry point for "where things stand right now, and what exists
> for what purpose." Rule: update this document at every milestone and commit it to git.
> Detailed design rationale and decisions live in the linked documents; this one holds only
> the map. (Last updated: 2026-07-10)

## North Star

**"A personal, fully-tailored video editor"** — throw in raw footage and (1) a rough cut is generated
automatically, (2) polish it in the browser with video-editor-grade UX, (3) it renders right
there. What sets it apart: it works on footage with no dialogue (vision-based), and it bakes
in the user's own editing grammar. See the "Project" section of CLAUDE.md for details.

## Component map (what exists for what purpose)

| Location | Role | Status |
|---|---|---|
| `packages/schema` | Cuesheet types + validation (contract's center, zod) | Stable. 82 tests |
| `packages/bridge` | MCP server for Claude Code connection (natural-language editing) | Stable. 26 tests |
| `packages/render` | Cuesheet -> ffmpeg render (CLI + buildRenderPlan, incl. two-pass title fallback) | Stable. 110 tests, verified with a real render |
| `apps/web` | Touch-up editor: cut editing, timeline trimming (scrub/handles/split), full timeline + BGM drag, proxy playback, export button | Actively evolving |
| `packages/draft` | **Core**: raw footage folder -> automatic rough-cut cuesheet generation (CLI `cuesheet-draft`: scan for inventory + frame extraction -> assemble for assembly; vision judgment handled by Claude) | Promoted to a proper package. 7 tests, scan/assemble E2E verified against a real footage folder |
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
  **Follow-up needed**: `apps/web`'s `POST /api/render` route currently runs `buildRenderPlan`'s
  top-level `args` directly - it needs to iterate `plan.commands` in order instead to actually
  support two-pass cuesheets (not changed here per this task's scope - apps/web was off limits,
  concurrent work in progress there).
- **Verified**: `pnpm --filter @cuesheet/render typecheck`/`test` green (110 tests, up from 89 -
  21 new: `timeline.test.ts`, `twoPass.test.ts`, plus new dispatch cases in `plan.test.ts`).
  End-to-end: a real two-pass render (12 synthetic HEVC 720p clips + 1 gooey title) completed in
  ~6.5s total (pass 1 2.5s, pass 2 4.0s) and the title was confirmed visible only inside its
  [0s, 2s) window (frame-extracted and inspected at t=1 vs t=5). The existing CLI's single-pass
  path (`project.cuesheet.json`, no title) re-verified unaffected (13s output, matching the
  earlier real-render figure).

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
