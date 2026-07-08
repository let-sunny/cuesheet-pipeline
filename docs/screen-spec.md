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
  [Duplicate] - [Set as intro] [Set as outro] - [Delete (danger color, last)]

Rationale: G1-G3 cover 90% of the edit loop (range -> subtitle), G4-G6 are occasional.
"Subtitle style for this cut" is a sub-property of subtitle, so it lives inside G3 — never
its own section (this is the core fix for the current problem).

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

## 6. Shared dialog layout

Astryx Dialog. Title -> body (same form-grid rules) -> footer with [Cancel] [Primary action]
at the right. Only one primary action gets emphasis.

## Changelog
- 2026-07-08 first draft — established the fix baseline for the hierarchy collapse (In/Out
  split apart, oversized Speed field, unclear ownership of style overrides).
- 2026-07-08 revision — card-internal spacing rule and excluded-card state representation
  rule (section 2); confirmed G1/G2 width tokens from real measurements (section 4).
