# STATUS — Living Status Document

> This document is the single entry point for "where things stand right now, and what exists
> for what purpose." Rule: update this document at every milestone and commit it to git.
> Detailed design rationale and decisions live in the linked documents; this one holds only
> the map. (Last updated: 2026-07-08)

## North Star

**"A personal, fully-tailored video editor"** — throw in raw footage and (1) a rough cut is generated
automatically, (2) polish it in the browser with video-editor-grade UX, (3) it renders right
there. What sets it apart: it works on footage with no dialogue (vision-based), and it bakes
in the user's own editing grammar. See the "Project" section of CLAUDE.md for details.

## Component map (what exists for what purpose)

| Location | Role | Status |
|---|---|---|
| `packages/schema` | Cuesheet types + validation (contract's center, zod) | Stable. 7 tests |
| `packages/bridge` | MCP server for Claude Code connection (natural-language editing) | Stable. 4 tests |
| `packages/render` | Cuesheet -> ffmpeg render (CLI + buildRenderPlan) | Stable. 8 tests, verified with a real render |
| `packages/web` | Touch-up editor: cut editing, timeline trimming (scrub/handles/split), full timeline + BGM drag, proxy playback, export button | Actively evolving |
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
