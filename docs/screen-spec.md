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
+- Cut list -----------+ +- Video column (sticky) ------------+
| row: thumbnail|       | | scene header (#n, badge, desc)     |
| subtitle (inline)     | | video (reframe, subtitle overlay)  |
|   |scene line|badge   | | playback controls (one row: play,  |
|                        | |   In, Out, split — hugs the video) |
|                        | +- Cut settings (order in section 4)-+
+------------------------+
```

## 4. Cut settings group definitions (fixed order and layout)

**G1. Range** — one row: `In [narrow] Out [narrow] Length 12.3s (read-only)`
**G2. Playback** — one row: `Speed [narrow]x Volume [narrow]%` (paired alignment, never
  oversized)
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
-> **Subtitle style (global)** (size/color/outline as one group / background box as one
group (toggle + color + opacity + margin) / position + edge margin in one row / note: "see
the (2) Edit video column for a live preview") -> **Intro/outro** (select + release,
collapsible manual entry) -> **BGM** -> **Narration** (toggle, folder, volume, help text) ->
**Output** ([Download subtitles .srt] [Export...] — Export dialog: resolution presets /
burn-in subtitles / summary / start).

**Button hierarchy and state rules for this step (2026-07-08, applies section 0/6 rules
concretely)**: the one primary of the whole step is [Export] in Output; [Download subtitles
.srt] is secondary. Within Intro/outro, "Upload file" is secondary and "Clear" is ghost —
Clear only un-assigns a reference (instantly reversible from the same panel via re-select),
it does not delete a file, so it is not treated as destructive (contrast with BGM row
[Delete], which removes a cue entry and is `variant="destructive"`). No section in this step
dims a whole row/card via opacity for any state (matches section 2's rule, generalized to
every step). Long file names (intro/outro "Clip: <name>" label, BGM `file` field) stay inside
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
- 2026-07-08 first draft — established the fix baseline for the hierarchy collapse (In/Out
  split apart, oversized Speed field, unclear ownership of style overrides).
- 2026-07-08 revision — card-internal spacing rule and excluded-card state representation
  rule (section 2); confirmed G1/G2 width tokens from real measurements (section 4).
