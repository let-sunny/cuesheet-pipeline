# Screen spec — Cuesheet editor

> 2026-07-08. The canonical screen layout, paired with PRD.md. **Hierarchy is rule #1** —
> every element must belong to an information group, and its importance must match its
> visual weight. Fix this document first when changing the UI, then implement.

## 0. Hierarchy rules that apply to every screen

1. **Grouping**: every control belongs to a named section (header + divider). If an
   element's group is ambiguous, decide where it belongs in this document before placing it.
2. **Alignment grid**: within a panel, labels sit in a single left-aligned column, and
   inputs use only 3 width tokens — `narrow` (5-digit numbers, e.g. In/Out/Speed/Volume),
   `medium` (selects, short text), `full` (textarea, sliders). Elements on the same row are
   baseline-aligned.
3. **Importance = size**: a control used less often, or less important, must never take up
   more space than one that's used more. (Example: Speed is a single narrow number field —
   if it ever eats a whole row the way it currently does, that's a violation.)
4. **Pairs sit side by side**: semantic pairs (In/Out, color/opacity) share a row. Never
   wrap one half onto its own line.
5. **Read-only info above, inputs below**: within a panel, order is info (scene, etc.) ->
   frequently-touched inputs -> occasionally-touched inputs -> destructive/rare actions
   (delete, etc.) last.
6. Use Astryx single components (PRD section 5-2). Custom code is allowed only for the 4
   domain-specific parts (timeline, crop overlay, palette card, video stage).
7. Unify units and formats: time as `12.3s`, ratios as `%`, colors shown as color picker +
   hex side by side.
8. **Never style raw element selectors globally** (e.g. a bare `button {}`, `input {}` rule in
   styles.css), and never reach into an Astryx component's rendered markup via a custom CSS class
   or a descendant selector either. Astryx components render plain HTML elements too (Astryx's
   `<Button>` is a plain `<button>`), and their variant styling lives inside a StyleX `@layer` —
   per the CSS cascade-layers spec, any unlayered rule always wins over every layered rule for the
   same property regardless of specificity, so any of our own CSS touching that element (however
   it's targeted) silently overrides the variant look. Astryx's own sanctioned customization path
   is component props: `variant`/`size` for the built-in options, `xstyle` (a `stylex.create()`
   value — compiles into our own `product` StyleX layer, which reliably wins over the library
   layer) for anything cheap and static, `style` (inline `CSSProperties`) as the escape hatch for
   anything dynamic/conditional. Never repeat the same `xstyle`/`style` tweak at 2+ call sites —
   promote it to a named wrapper component instead (`packages/web/src/components/ui/`, one folder
   per component; see `CompactButton`/`CardActionButton`/`IoAssignButton` for examples). Raw
   (non-Astryx) elements that still exist for the 4 domain-custom areas (rule 6) get an explicit
   marker class instead (e.g. `.plain-button`, `.plain-field`) and are styled via that class, never
   via the bare tag.

## 1. Header (global, fixed)

`[App name] [Step nav] ... [Undo][Redo] | [Theme toggle] [?] | [Save (dirty dot)] [Export]`
— the primary actions (Save/Export) sit at the far right. Export always opens through a
dialog.

**Dirty-state emphasis (2026-07-09 addition, section 6 applied concretely to this group)**:
Save and Export are a two-button group, so exactly one of them is `primary` at any time — which
one flips with dirty state instead of always being Export. While dirty, losing unsaved edits is
the higher-stakes outcome than exporting slightly later, so Save gets `primary` (plus the dirty
dot) and Export steps down to `secondary`. Once clean (saved), Export reverts to `primary` and
Save becomes a quiet `secondary` action. This is why Save is allowed to outrank Export here even
though section 5 calls Export "the one primary of the whole step" — that rule describes the
steady (clean) state; the header's own group has its own state-dependent primary.

## 2. (1) Scenes

```
[Category filter row][Status filter row (All / In use only / Excluded only)]
[Candidate grid — cards]
```
Card-internal hierarchy: thumbnail -> status badge (in-use / excluded reason) -> scene
description (full text, not clamped — this screen exists to read the description and
choose, so it must never be truncated) -> metadata (clip, timestamp, shot type, quality) ->
action row ([Add]/[Remove] primary, [Set as intro]/[Set as outro] secondary — primary and
secondary must be visually distinct).

**Card-internal spacing (2026-07-08 revision)**: the thumbnail is full-bleed, no padding
(fills the card edge to edge). Everything below it (description/metadata/actions) sits in
one body container with a unified 12px padding and a 10px gap between groups
(description <-> metadata <-> actions); within the actions group, [Add]/[Remove] and
[Set as intro]/[Set as outro] sit tighter (6px). Because the Astryx Card is used with
padding=0, this single body container (`.moment-card-body`) owns all padding/spacing —
individual children must not carry their own padding. The metadata row (category badge,
length, quality) is baseline-aligned.

**State representation rule (2026-07-08 revision — fixes the "which one is dimmed and why"
misread)**: excluded cards (quality below threshold / face exposure) must not dim the whole
card via opacity — full dimming reads as "disabled/loading". Instead: (a) desaturate only
the thumbnail image (grayscale 60-80%) — the scene itself stays legible, the only signal is
"the auto-draft didn't pick this". (b) State the exclusion reason on a full-width banner at
the very top of the card — far more noticeable than a small corner badge. (c) The [Add]
button stays enabled — exclusion means "the automation filtered it out", not "forbidden";
the user can always bring it back, and the button state must show that. Description and
metadata text keep full contrast (not dimmed).

## 3. (2) Edit (single screen)

```
[Timeline (zoom controls at the far right)]
[Play all button]
[BGM gutter header: collapse toggle + count badge | + Add track]
+gu+- Cut list -----------+ +- Video column (sticky) ------------+
|tt| row: thumbnail|       | | scene header (#n, badge, desc)     |
|er| subtitle (inline)     | | video (reframe, subtitle overlay)  |
|  |   |scene line|badge   | | Overview bar (full clip)           |
|  |                        | | Zoomed-in bar (drag In/Out here)   |
|  |                        | | playback controls (one row: play,  |
|  |                        | |   In, Out, split — hugs the video) |
|  |                        | +- Cut settings OR BGM settings -----+
+--+------------------------+   (right column swaps per selection)
```

**BGM gutter (2026-07-09, replaces the earlier "Timeline · Background music (BGM)" section
that lived in the Export step)**: background music editing moved next to the cut list because
you cannot place music against nothing — you need to see cut content (thumbnails/subtitles/scene
lines) to decide "the music changes at cut #3". Design:
- Each bgm cue renders as a **vertical bar in the gutter spanning the cut rows it covers** — not
  a proportional-time horizontal lane. Storage stays seconds (the schema/render contract is
  unchanged); the gutter converts cut index <-> accumulated playback time
  (`lib/bgmCutMapping.ts`) purely for display/editing.
- **Anchoring**: dragging a bar (move) or its top/bottom edge (resize) snaps to **cut
  boundaries**, never an arbitrary pixel/second. Bar geometry is read directly off the actual
  rendered row elements' `offsetTop`/`offsetHeight` (not computed from a separate proportional
  time axis), so it is pixel-exact with the cut list by construction — a row growing (subtitle
  text wrapping) keeps the bar aligned without any separate sync logic.
- **Overlaps are allowed** (e.g. a music bed under a shorter sting) — overlapping cues are
  assigned to separate lanes (`lib/bgmLanes.ts`, greedy interval scheduling) and render as
  parallel thin columns in the gutter, each independently clickable/draggable.
- **Collapsible**: the whole gutter can be collapsed to a thin strip via its header toggle (a
  count badge shows how many tracks exist while collapsed, since tracks can multiply).
- **Selection swaps the right column**: clicking a bar sets the panel on the right to
  `BgmSettingsPanel` instead of Cut settings — file picker (with pre-listen: a play/stop button
  next to each candidate file, so auditioning doesn't require assigning first), start/end shown
  as cut numbers ("Cuts 3-17") alongside the seconds they resolve to, volume, and a separated
  destructive [Remove track]. Clicking a cut row (not a bar) swaps the panel back to Cut
  settings. "+ Add track" (gutter header) adds a track defaulting to span just the currently
  selected cut.
- Works alongside "Play all" so timing can be audited by ear while watching.
- The Export step (section 5) now shows only a one-line, read-only summary — see there.

**Two-level trim (2026-07-09)**: a single scrub bar mapping the *entire clip's* duration to its
pixel width makes a short in/out range (e.g. 3s inside a 900s+ long take) sub-pixel and
undraggable. Fixed with two stacked bars under the video, both always visible:
- **Overview bar** — the full clip; shows the detail bar's current zoom window as a highlighted
  box. Click or drag anywhere on it re-centers the window on that point (the window's width is
  unchanged, only its position moves).
- **Detail (zoomed-in) bar** — maps only the current zoom window to its width, so In/Out handles
  get real pixel room to drag regardless of clip length. Default window: the cut's in/out range
  padded by 30% of its own length on each side, widened to at least 20s (or the whole clip, if
  shorter than that — so a short clip's "window" is simply the entire clip, both bars reading
  effectively the same range). The window resets to this default when the selected cut or the
  clip's duration changes, but deliberately *not* on every in/out edit — it holds still while
  dragging the detail handles; only the overview bar (a separate, deliberate action) repositions
  it.
- Both bars show the current-time playhead; [Set In here]/[Set Out here] are unchanged (they use
  the current playback position, independent of which bar is visible).

## 4. Cut settings group definitions (fixed order and layout)

**G1. Range** — one row: `In [narrow] Out [narrow] Length 12.3s (read-only)`
**G2. Playback** — one row: `Speed [narrow]x Volume [narrow]%` (paired alignment, never
  oversized). Speed is capped at **16x** (input: min 0.1, step 0.1, max 16; over-entry clamps
  instead of erroring, with a note shown once the cap is hit) — browsers throw setting
  `HTMLMediaElement.playbackRate` above 16, which would otherwise crash this same preview. The
  schema enforces the same cap (`speed must be <= 16`), and VideoPreview/SequencePlayer also
  defensively clamp the value actually assigned to `playbackRate` (belt-and-suspenders for
  old/hand-edited data and the J/K/L shuttle's further multiplier).
**G3. Subtitle** — textarea (full) + collapsible sub-section **"Subtitle style for this
  cut"** (indented/bordered to make clear it belongs under Subtitle): size, color, outline,
  background (color + opacity in one row), margin + [Apply to all cuts] [Release]
**G4. Narration** — select (medium) + preview + length warning (shown only when narration
  is in use)
**G5. Reframe** — status display + [Edit] [Release] (Edit opens an overlay mode on the video)
**G6. Cut actions** — one row of buttons: [Split Cmd+B] [Merge with next cut Cmd+J]
  [Duplicate] [Set as intro] [Set as outro]. No primary in this row — none of these five is
  a dominant/default action, so all are `secondary`/`ghost` (2026-07-08 revision: this group
  used to also hold Delete at the end, visually pushed right by a CSS trick; that read as
  "just another cut action" and risked a misclick on a destructive operation).
**Destructive zone (separate from G6, panel bottom)** — [Delete], alone, separated from G6 by
  a divider + extra spacing and rendered `variant="destructive"`. This is not a numbered G
  group: it is deliberately isolated so it can never be mistaken for a routine action (section
  0-5 "destructive/rare actions ... last" taken literally — last and set apart, not just last
  in reading order).

Rationale: G1-G3 cover 90% of the edit loop (range -> subtitle), G4-G6 are occasional.
"Subtitle style for this cut" is a sub-property of subtitle, so it lives inside G3 — never
its own section (this is the core fix for the current problem). The clip filename in G1 is
read-only plain text (not an input) — the only legitimate way to change which source clip a
cut points to is picking a scene in (1) Scenes or duplicating an existing cut; hand-typing a
filename is error-prone and was never a real, supported path.

**Confirmed width tokens for G1/G2 (2026-07-08, measured)**: label column 40px, `narrow`
input 80px (up from 64px — 64px let a 5-character decimal value like `39.87` collide with
the native number-input spinner and get visually clipped, reproduced on a real cut), field
slot (label + input + unit suffix) 144px fixed regardless of whether a unit suffix is
present. The fixed slot width is what makes the second field in each row (Out / Volume)
start at the same x across both rows — without it, a 1-character label ("Out") vs a
2-character label ("Volume") plus the presence/absence of a unit suffix ("x" / "%") shifted
the second input's start position by as much as 24px row to row, which read as the whole row
leaning right. The read-only `Length` text in G1 wraps to its own line when the panel is too
narrow to fit all three items on one row (`qf-row` already used `flex-wrap: wrap`) — this is
expected degradation, not a bug.

## 5. (3) Export

Section order (the natural order of preparing output): **Project** (name, fps, resolution)
-> **Subtitle style (global)** (compact live preview / size/color/outline as one group /
background box as one group / position + edge margin, each its own row / note pointing at the
(2) Edit video column for the composited-over-actual-video version) -> **Intro/outro** (select +
release, collapsible manual entry) -> **Background music** (one-line summary only — editing
lives in the (2) Edit step, see section 3) -> **Narration** (toggle, folder, volume, help text) ->
**Output** ([Download subtitles .srt] [Export...] — Export dialog: resolution presets /
burn-in subtitles / summary / start).

**Layout tokens (2026-07-09 revision — fixes the "inputs are tiny and right-skewed" bug)**: a
section's form content is capped at a **readable column width** (620px; 680px for the subtitle
style section, which also holds a preview stage) and left-anchored — the panel itself can be much
wider than that on a large viewport, and that extra width is deliberately left empty on the right
rather than stretched into. Within a row, the **label sits in a fixed 120px column immediately to
the left of its field** — never `justify-content: space-between` (that was the actual bug: with
the section stretched to the full step-body width, space-between threw the label to the far left
and the field to the far right with a large empty gap between, which read as "tiny, right-skewed
inputs" even though the fields themselves weren't small). Field width is chosen by content type,
not by the row: numbers use the shared `narrow` token (80px, same as Cut settings' G1/G2); short
free text (Name, Font) uses a wider `medium` text token (240px, `.field-text-medium` — distinct
from the 180px `.field-medium` used for selects elsewhere, since 180px reads cramped for a text
field); color rows keep the swatch + hex pair immediately adjacent to the label, never split
across the panel. **Background box group**: the enable checkbox, then (only while enabled) color,
opacity, and padding, each its own row. **Position and Edge margin are two separate rows** (not
one shared row) — cramming a select and a slider onto one row is what caused a clipped "Position"
label and a squeezed slider in the first place; there's no space constraint forcing them together.

**Subtitle style live preview (2026-07-09 addition)**: a compact (~360px, 16:9) preview stage
sits directly under the section header, visible while every control below it is adjusted — an
earlier, bulkier full-preview was removed for being redundant with the Edit step, but removing all
in-place feedback went too far; this restores just enough. It renders a sample line ("자막
미리보기 Aa 123") over a real frame thumbnail from the first cut's clip (falling back to a fixed
dark stage color), using the *exact* overlay CSS/merge helpers the Edit step's video uses
(`lib/subtitleOverlay.ts`, `.video-subtitle-overlay*` classes) — reused, not re-implemented, so it
cannot drift out of sync with the real thing. Respects position/edge margin and the background
box exactly as the real overlay does.

**Button hierarchy and state rules for this step (2026-07-08, applies section 0/6 rules
concretely)**: the one primary of the whole step is [Export] in Output; [Download subtitles
.srt] is secondary. Within Intro/outro, "Upload file" is secondary and "Clear" is ghost —
Clear only un-assigns a reference (instantly reversible from the same panel via re-select),
it does not delete a file, so it is not treated as destructive. No section in this step
dims a whole row/card via opacity for any state (matches section 2's rule, generalized to
every step). Long file names (intro/outro "Clip: <name>" label) stay inside
their row's bounds via ellipsis or wrap — never raw layout overflow; native `<select>`
elements truncate long option text using the browser's own mechanism, which is acceptable
(contained, not a custom-overflow bug). Free-text fields are only used where there is no
picker alternative (e.g. narration folder — a filesystem path with no browser folder-picker
API); anything with a real picker (clip files) must not also expose a free-text edit path.

## 6. Shared dialog layout, and button-group hierarchy (any multi-button row)

Astryx Dialog. Title -> body (same form-grid rules) -> footer with [Cancel] [Primary action]
at the right. Only one primary action gets emphasis.

**General rule, not just dialogs**: any row/group of buttons that belong together (dialog
footer, banner actions, a toolbar) must have at most one `variant="primary"` — pick the
single recommended/default action and give it primary; every other action in that same group
is `secondary` or `ghost`, and destructive actions are always `variant="destructive"`
regardless of whether the group has a primary. A group with no dominant action (e.g. a row of
equally-weighted operations) may have zero primaries — that's fine, it just must not have two.
Buttons that belong to one group render inside one container (not spread across a
`justify-content: space-between` row shared with unrelated content like a text label) so they
stay visually together, and action groups in banners/dialog footers are right-aligned.

## Changelog
- 2026-07-09 — four changes in one round, in priority order: (1) BGM editing moved from the
  Export step into a collapsible vertical gutter next to the (2) Edit cut list, anchored to cut
  boundaries with overlap lanes (section 3) - Export now shows a one-line summary only (section
  5); (2) Export step layout tokens fixed - readable-column max-width, fixed-width left label,
  content-typed field widths, background box/position/margin split into one-field-per-row
  (section 5), plus a restored compact live subtitle-style preview reusing the Edit step's own
  overlay code; (3) segment.speed capped at 16 (schema + UI clamp + defensive playbackRate clamp)
  since browsers throw above that (section 4, G2); (4) two-level trim (overview + zoomed-in bar)
  in the Edit video column so a short in/out range inside a long source clip still gets real,
  draggable handle spacing (section 3).
- 2026-07-09 — added rule 8 (never style raw element selectors globally, and never reach into
  Astryx components via CSS at all — props only). Root cause of a reported "button hierarchy
  invisible" bug: styles.css's unlayered `button {}` / `button:hover:not(:disabled)` /
  `button:disabled` (and `input`/`select`/`textarea`) rules always beat Astryx Button's layered
  per-variant background (unlayered beats layered regardless of specificity), flattening every
  primary/secondary/ghost/destructive button to the same look. Also found (same mechanism, smaller
  blast radius): `.crop-edit-actions button`, `.moment-card-actions button`, and `.moment-io-button`
  were reaching into Astryx Buttons via descendant/class selectors to tweak size/color. Fixed by:
  (1) scoping the global rules to `.plain-button`/`.plain-field` marker classes, added to every
  remaining raw `<button>`/`<input>`/`<select>`/`<textarea>`; (2) replacing the 3 CSS-reaches-into-
  Astryx cases with named wrapper components (`CompactButton`, `CardActionButton`,
  `IoAssignButton` under `packages/web/src/components/ui/`) that apply the tweak via `xstyle`
  instead; (3) moving the one-off `.add-button` margin tweak on BgmEditor's Button to inline
  `style`.
- 2026-07-08 first draft — established the fix baseline for the hierarchy collapse (In/Out
  split apart, oversized Speed field, unclear ownership of style overrides).
- 2026-07-08 revision — card-internal spacing rule and excluded-card state representation
  rule (section 2); confirmed G1/G2 width tokens from real measurements (section 4).
