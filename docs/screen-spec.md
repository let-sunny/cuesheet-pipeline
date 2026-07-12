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
   promote it to a named wrapper component instead (`apps/web/src/components/ui/`, one folder
   per component; see `ToolbarButton`/`SceneCardButton`/`IntroOutroButton` for examples). Raw
   (non-Astryx) elements that still exist for the 4 domain-custom areas (rule 6) get an explicit
   marker class instead (e.g. `.plain-button`, `.plain-field`) and are styled via that class, never
   via the bare tag.

## 1. Header (global, fixed)

`[App name] [Step nav] ... [Undo][Redo] | [Theme toggle] [?] | [Save (dirty dot)] [Export]`
— the primary actions (Save/Export) sit at the far right. Export always opens through a
dialog. Undo/Redo are icon buttons (Astryx `Icon` `chevronLeft`/`chevronRight`), not text. The
step nav's three tabs show a meaning icon each (Film / Scissors / Download for Scenes / Edit /
Export) instead of a step-number prefix.

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
[Status filter row (SegmentedControl: All / In use / Excluded)]
[Category filter row (horizontally-scrolling pill strip, one row, never wraps)]
[Candidate grid — cards]
```
Status and category are two independent facets, not one flat chip row (2026-07-11 faceted-
filtering restructure): status is a stock Astryx `SegmentedControl`; category is a standalone
`ToggleButton`-based pill strip (not `ToggleButtonGroup` — its React-context coordination broke
under this app's dev-server module duplication). A category chip's count reflects the active
status filter (so "Wearing (4)" never promises a count the status filter would then show as 0);
a category that drops to 0 stays visible, disabled, rather than vanishing (an empty option is
still a real, expected option, not a broken one).

**Horizontal card layout (2026-07-11 QA fix)**: cards changed from thumbnail-stacked-on-top to a
**horizontal card** — a larger thumbnail column on the left, metadata stacked on the right — per
the researched convention (Premiere's bin thumbnail view, Final Cut's event browser, DaVinci's
media pool all lay clip cards out this way; no invented UI patterns, CLAUDE.md). Every card —
excluded or not — renders at the same fixed row height now (2026-07-11 uniform-height fix); the
exclusion reason no longer adds a sibling banner row above it (see the state-representation rule
below), which is what makes a uniform height possible in every state.

Card-internal hierarchy (2026-07-11 revision, superseding the paragraphs below — see the
2026-07-11 changelog entries): thumbnail (in-use badge overlaid top; excluded-reason scrim
overlaid bottom, only when excluded) -> scene description (clamped to ~3 lines/60px with
internal scroll for anything longer — earlier language below said "never truncated"; that was
revised once a long description was found growing the whole card and breaking the grid's
uniform row height) -> metadata cluster (clip filename + time range on one line, category badge
+ quality on the next) -> a single state-driven [Add]/[Remove] icon-only toggle, pinned to the
card's bottom-right corner (the card's single most important action gets its single most
prominent corner). Setting a card's clip as intro/outro is no longer done from this card at all
— it moved to the (2) Edit step's Cut actions (section 4) — so there is no second action here.

**Single add/remove toggle (2026-07-09 revision, icon-only since 2026-07-11)**: one button, not
a pair - label and variant flip with whether the card is already added (`Add`/`check` icon when
unused, `Remove`/`close` icon when in use, both `variant="ghost"` — position alone signals
primacy here, not a heavier fill), instead of always rendering both buttons and disabling+hiding
whichever doesn't apply. A card's excluded (auto-filtered) state doesn't change this - the same
confirm-before-adding flow (face policy check) still runs regardless of which state the toggle
is in when clicked.

**Card-internal spacing (2026-07-08 revision, superseded in part 2026-07-11)**: the thumbnail is
full-bleed, no padding (fills its column edge to edge). Everything to its right (description/
metadata/action) sits in one body container (`cardBody`) with a unified padding and a gap
between groups; because the Astryx Card is used with padding=0, this single body container owns
all padding/spacing — individual children must not carry their own padding.

**Thumbnail composition (2026-07-11 revision)**: the thumbnail is a plain, full-bleed `img`
(`objectFit: cover`) inside a fixed-width column (`thumbCol`, ~45% of the card, `position:
relative`) stretched to the card row's own fixed height by the row's `alignItems: stretch` — not
`AspectRatio`, which would derive its own height from a 16:9 ratio regardless of the row's actual
box and leave letterbox gaps once every card was pinned to one uniform height (2026-07-11 fix,
below). An Astryx `Overlay` (`scrim={false}`, `position="top"`) anchors just the in-use badge (a
real `Badge`, `variant="success"`, the cut number as its label) to the thumbnail's top; the
index/timestamp chip that used to share that corner was removed (2026-07-11 user feedback —
declutter the thumbnail, all text metadata moved to the card's right side, see the metadata
cluster above). The excluded-reason text (below) is a second, separate absolute overlay anchored
to the same `thumbCol`, not part of the `Overlay` composition.

**State representation rule (2026-07-11 revision, superseding the 2026-07-08 rule below)**:
excluded cards (quality below threshold / face exposure) are told apart from a normal card by
(a) a 1px card border colored by rejection reason (red for face, yellow for quality) and (b) the
reason text on a translucent-black scrim across the bottom of the thumbnail only (not a
full-width banner above the card — a banner added a whole extra row's height to only excluded
cards, breaking the grid's uniform row height, which is why it was replaced). Full-opacity
dimming and thumbnail desaturation were both tried and abandoned (both hurt readability); the
card and thumbnail always render at full contrast. The [Add]/[Remove] toggle stays enabled
either way — exclusion means "the automation filtered it out", not "forbidden"; the user can
always bring it back.

## 3. (2) Edit (single screen)

```
[Timeline (zoom controls at the far right)]
[Play all button]
+--+- Cut list -------------+ +- Video column (sticky) ------------+
|  | row: subtitle (inline) | | scene header (#n, badge, desc)     |
|  |   |scene line|badge    | | video (reframe, title/subtitle     |
|  |                        | |   overlay)                         |
|  |                        | | TrimStrip (filmstrip, drag In/Out) |
|  |                        | |   zoom row (-/Fit cut/Fit clip/+)  |
|  |                        | |   pan control (only while zoomed)  |
|  |                        | | playback controls (one row: go to  |
|  |                        | |   start, Play/Pause, mark In/Out,  |
|  |                        | |   split, capture frame, reframe)   |
|  |                        | |   playback-mode toggle (secondary, |
|  |                        | |   smaller than Play — Loop/Full)   |
|  |                        | +- Cut settings (Cut/Effects seg) ---+
+--+------------------------+
```
**Background music** is a separate layer, not part of the cut/video/settings row above. A
collapsible side rail sits between the cut list and the workspace, holding a per-cut gutter lane:
add a track (+) and drag/resize its bar to span the cuts it plays under. Selecting a track opens a
**horizontal property bar at the top of the Edit step** (above the whole row) — File dropdown +
preview, Volume, Range in cut numbers, Remove — so BGM editing never displaces the Cut settings
column (which always stays SegmentQuickFields). Close (X) or Esc deselects the track and closes the
bar. See section 4's BGM subsection.

**No thumbnail in the cut list row (2026-07-11 QA fix)**: the row's subtitle text + scene
description already identify the cut, and clicking a row shows it in the right-side VideoPreview,
so the thumbnail was redundant width on a compact list whose whole point is fitting beside the
video column. The freed ~50px (thumbnail + its gap) goes to the subtitle text column. The Scenes
step's cards (section 2) keep thumbnails — that screen has no right-side preview to fall back on.

**Video toolbar row (2026-07-11/07-12 revisions)**: go to start (lucide `SkipBack`) / Play-Pause
(lucide `Play`/`Pause`, reflecting the actual `<video>` play state instead of only ever offering
Play) / Mark In / Mark Out / Split / Capture frame, then — unless a reframe edit is already in
progress (in which case its own Full frame/Apply/Cancel/Clear toolbar takes over) — a Reframe (or
"Adjust reframe", once a crop exists) entry point. Reframe is not a Cut settings group (section 4)
— its edits happen directly on the video via an overlay, so its entry point lives here, beside the
other video-toolbar actions ("structure matches flow"). Below this row, the playback-mode toggle
(Loop range / Full clip, a stock Astryx `SegmentedControl`) is a secondary setting, sized and
colored quieter than the primary Play/Pause button (never visually larger than it).

**Play all stage (2026-07-12 fix)**: the stage keeps a strict 16:9 box (derived via `aspectRatio`,
not a height cap independent of width) so the video never letterboxes/pillarboxes regardless of
viewport size, and the subtitle overlay sizes itself in `cqw` (container-query width units)
relative to that same box — matching the (2) Edit video column's own subtitle sizing approach
(`lib/subtitleOverlay.ts`, shared) so what's previewed here matches what exports.

**TrimStrip (2026-07-09, replaces the earlier "two-level trim" two-stacked-bars design)**: mapping
a long clip's *entire* duration onto one scrub bar's pixel width makes a short in/out range (e.g.
3s inside a 900s+ long take) sub-pixel and undraggable. The two-stacked-bars fix that originally
shipped for this (an "overview" bar showing a highlighted zoom-window box above a "detail" bar)
read as an inert, uninteractive box — neither bar rendered any content, so the window had nothing
to communicate against, and it introduced a third abstraction (the "window") beyond the playhead
and the in/out handles every user already tracks. Superseded by the researched convention instead
(`docs/research/trim-ux-conventions.md` section 4 — no invented UI patterns, CLAUDE.md): **one
zoomable filmstrip strip**, the Premiere Source Monitor model (single scrub surface, precision via
zooming that same surface), plus a scrollbar-styled pan control that only appears once zoomed in
(`components/TrimStrip`):
- **The strip** — full panel width, ~48px tall, tiled with real filmstrip thumbnails of the
  visible viewport (one `SegmentThumb` per ~64px; a per-cell ruler-tick fallback covers both "still
  loading" and "thumbnail unavailable" so it's never a blank track). The shaded in/out range, the
  In/Out drag handles, and the playhead are overlaid on top, unchanged from before. Default
  viewport on selecting a cut: the cut's in/out range padded by 30% of its own length on each side,
  widened to at least 20s (or the whole clip, if shorter — so a short clip's viewport is simply the
  entire clip, and the pan control never appears). The viewport holds still while dragging a
  handle; only a deliberate zoom/pan action moves it. Dragging a handle also seeks the preview to
  that handle's frame.
- **Zoom** — Ctrl/Cmd+wheel over the strip zooms centered on the cursor's time position (same
  gesture as the always-visible mini timeline strip); a small button row at the strip's right end
  (`-` / "Fit cut" / "Fit clip" / `+`) zooms centered on the playhead, where "Fit cut" restores the
  default viewport above and "Fit clip" is `[0, duration]`; Shift+Z is the same "Fit clip" reset.
  Max zoom is a 1s-wide viewport.
- **Pan control** — a slim scrollbar-styled trough below the strip, shown only once zoomed in past
  Fit clip. Its thumb's position/width mirrors the viewport within `[0, duration]`: dragging the
  thumb body pans, dragging a thumb edge resizes the zoom (Premiere's zoom-scroll-bar convention),
  and clicking the trough jumps the viewport there. A min-2px accent tick inside the trough always
  marks where the cut's in/out lives in the whole clip, even at sub-pixel scale.
- [Set In here]/[Set Out here] are unchanged (they use the current playback position, independent
  of the strip's current zoom/pan).
- The In/Out numeric fields (section 4, Range group) additionally take Up/Down = ±1 frame (derived
  from `project.fps`) and Shift+Up/Down = ±1s, committing immediately; typed text accepts `M:SS.s`
  shorthand and a leading `+`/`-` as a delta from the current value.

**Baseline viewports and column-width tokens (2026-07-10, 13-inch density pass)**: this app's
supported baseline viewports are **1280x800 and 1440x900** (a 13-inch MacBook at 100% browser
zoom) — the (2) Edit step's three columns (cut list, video, cut settings) must sit **side by
side** at both, not wrap, and the cut settings column must fit within the viewport (reachable via
its own internal scroll, section 3's `trimFieldsCol` mechanism below — not by scrolling the whole
page first). The fix here was **arrangement, not sizing**: no root font-size/rem scaling, no
global token shrink, and no restyling of Astryx components' own sizing — Astryx components keep
their designed size as-is. Only this app's own column-width tokens and the cut list row's internal
layout changed:
- **Cut list column** (`CompactSegmentList.styles.ts`'s `list`) — 480px -> **300px**. At the old
  480px, the row's time range/style badge/subtitle dot/reorder+delete actions sat beside the
  subtitle text as row-level siblings; narrowing to 300px directly would have squeezed that text
  column down to an unreadable sliver. Fixed by moving those elements onto **their own line**
  below the subtitle (`metaRow`), a common two-line list-row convention (title line + metadata
  line, matching Premiere's/Resolve's own bin/list rows) — not an invented pattern.
- **Cut settings column** (`EditStep.styles.ts`'s `trimFieldsCol`) — 424-440px (flexible) ->
  a **fixed 344px** (flexGrow/flexShrink both 0). 344px keeps ~312px of usable width after the
  panel's own padding, comfortably fitting the Range/Playback grid's existing 144px-slot x2 + 16px
  gap = 304px requirement (section 4's G1/G2 tokens themselves are unchanged) — this column no
  longer grows to fill leftover space, so any width it doesn't need goes to the video column
  instead (see below).
- **Video column** (`EditStep.styles.ts`'s `trimVideoCol`) — left **unchanged** (480px min,
  `flexGrow: 2`). The freed width from the two narrower columns above is exactly what lets it grow
  wider at 1440x900 (and beyond) — the point of narrowing the chrome is to hand width back to the
  video/preview area, never to shrink it.
- **Sticky column max-height, corrected for the pre-scroll case** (`hooks/useStickyColumnMaxHeight.ts`) —
  `trimFieldsCol`'s `max-height: calc(100vh - 32px)` (task #21's original fix) assumed the sticky
  workspace was already pinned to its stuck `top: 12px` offset, which is only true *after* the user
  scrolls past its natural in-flow position (page header + step nav + mini timeline strip above
  it, measured ~178px at both baseline viewports). Landing on the Edit step and selecting a cut —
  the common case — renders the column at that larger, natural offset instead, so the old fixed
  calc() left the column's bottom edge below the fold even though the cap looked correct on paper.
  The column's max-height is now computed from its actual measured offset (on mount + window
  resize), closing that gap without touching the underlying sticky/internal-scroll mechanism
  itself.

With these three changes, at 1280x800 the cut list (300px) + video (480px min) + cut settings
(344px) + gaps/padding total ~1246px (34px slack); at 1440x900 the extra ~194px goes entirely to
the video column via its own `flexGrow`.

## 4. Cut settings group definitions (fixed order and layout)

**No panel title (2026-07-11 QA fix)**: the "Cut settings" `<h2>` above G1 was removed — the
panel's context is already obvious while scrolling vertically through it (`data-testid="cut-
settings-panel"` stays as the stable test hook, just with no visible title).

**Cut / Effects segmented toggle (2026-07-11 split; 2026-07-12 tabs -> SegmentedControl)**: the
panel splits into a **Cut** view (the edits made while actually trimming/arranging a cut) and an
**Effects** view (the cosmetic overlay edits), roughly halving the panel's vertical length so it
fits a 13-inch viewport without scrolling — this superseded the earlier single-column G1-G8 layout
described in older revisions of this section. The switch is an Astryx `SegmentedControl` (radio
group), not a `TabList` — the two are views of the same cut's settings, not separate destinations,
so a segmented toggle reads truer. @astryxdesign/core 0.1.3's SegmentedControl doesn't forward
`data-testid` (upstream fix facebook/astryx#3852, unreleased), so tests select the two by
`role="radio"` + name ("Cut"/"Effects"). Group numbering below (G1, G2, ...) numbers within each
view, not across the whole panel.

**Cut view** — Range -> Playback -> Narration (conditional) -> Cut actions -> Delete (destructive,
separated):
- **G1. Range** — one row: `In [narrow] Out [narrow] Length 12.3s (read-only)`
- **G2. Playback** — one row: `Speed [narrow] Volume [narrow]` plus a decorative Percent icon
  after Volume (the "x" unit text that used to sit next to Speed was dropped as redundant — the
  field's own "Speed" label already carries the meaning). Speed is capped at **16x** (input: min
  0.1, step 0.1, max 16; over-entry clamps instead of erroring, with a note shown once the cap is
  hit) — browsers throw setting `HTMLMediaElement.playbackRate` above 16, which would otherwise
  crash this same preview. The schema enforces the same cap (`speed must be <= 16`), and
  VideoPreview/SequencePlayer also defensively clamp the value actually assigned to
  `playbackRate` (belt-and-suspenders for old/hand-edited data and the J/K/L shuttle's further
  multiplier).
- **Narration** (shown only when narration is in use) — select (medium) + preview + length
  warning. Kept inline rather than promoted to its own numbered group (small, always
  conditional).
- **Cut actions** — two rows (2026-07-11 user feedback: intro/outro assignment reads as a
  distinct kind of action from the edit-this-cut buttons, so it now sits on its own line): row 1
  is [Split Cmd+B] [Merge with next cut Cmd+J] [Duplicate]; row 2 is [Set as intro] [Set as
  outro] (disabled + reason if the clip is longer than 15s — this is where intro/outro
  assignment lives now; the (1) Scenes card no longer has these buttons, see section 2). No
  primary in either row — none of these five is a dominant/default action, so all are
  `secondary`/`ghost`.
- **Destructive zone** (separate, panel bottom of this view) — [Delete], alone, separated by a
  divider + extra spacing and rendered `variant="destructive"`. Deliberately isolated so it can
  never be mistaken for a routine action (section 0-5 "destructive/rare actions ... last" taken
  literally — last and set apart, not just last in reading order).

**Effects view** — Subtitle -> Title -> Transitions:
- **Subtitle** — textarea (full) + a **Style preset** select (medium, shown only once at least
  one preset exists — see section 5's "Subtitle style" section) sitting above the collapsible
  sub-section **"Subtitle style for this cut"** (indented/bordered to make clear it belongs under
  Subtitle): size, color, outline, background (color + opacity in one row), margin + [Apply to
  all cuts] [Release]. Merge order when both are present: global subtitle style < the selected
  preset < this cut's own override (per-cut override always wins last).
- **Title** — a **Title card for this cut** checkbox; once on: text (full, 80-char cap), preset
  select + duration (paired row, matching the Playback group's Speed/Volume pairing pattern),
  color + size (paired row), and a **Backdrop dim** slider (0-100%, 0% = no dim layer). Preset
  options, shipped (superseding an earlier design sketch that named a different Gooey/Melt/
  Particle/Typing lineup): **Fade** (calm scale+opacity entrance), **Word stagger** (each word
  eases in with a stagger), **Typing** (typewriter reveal + blinking cursor), **Highlight** (a
  pastel marker sweeps in behind the last word). Defaults: color `#ffffff`, size 500, font
  Pretendard (bundled into the render so exports match the preview). All four presets render the
  same way — Remotion, headless frame-capture -> transparent PNG sequence -> alpha-overlay
  composite at render time (no separate ASS/libass path for any preset). The live preview in the
  video column (`TitleOverlay`/`TitlePreview`) runs the identical animation math in plain React +
  `requestAnimationFrame` rather than `@remotion/player` (which repeatedly failed to animate
  reliably in this environment), so it's pixel-identical without a Remotion runtime in the
  browser; it auto-loops with no play/pause/restart controls of its own (a floating control chip
  used to overlap the burned-in subtitle).
- **Transitions** — two independent sub-blocks, **Transition in** and **Transition out**, each a
  checkbox that once on reveals: type select (Fade/Dip) + duration (narrow, paired row) and a
  **Dip amount** slider (0-100%, shown only when type is Dip — Fade always fades fully to black,
  so it has no amount control). A parity note under the group states the Edit-step video's
  fade/dip is an opacity-ramp approximation, not the real render.

**Reframe is not a Cut settings group.** Its entry point ([Reframe]/[Adjust reframe]) lives on
the video toolbar itself, next to Capture frame (section 3) — reframe edits happen directly on
the video via an overlay, so its entry point belongs there ("structure matches flow"), not in
this panel.

Rationale: Range/Playback/Subtitle cover most of the edit loop; Narration/Title/Transitions/Cut
actions are occasional — splitting them across the Cut/Effects views is what keeps either view short
enough for a 13-inch viewport. "Subtitle style for this cut" is a sub-property of subtitle, so it
lives inside the Subtitle group — never its own section. The clip filename in Range is read-only
plain text (not an input) — the only legitimate way to change which source clip a cut points to
is picking a scene in (1) Scenes or duplicating an existing cut; hand-typing a filename is
error-prone and was never a real, supported path.

**Confirmed width tokens for Range/Playback (2026-07-08, measured)**: label column 40px, `narrow`
input 80px (up from 64px — 64px let a 5-character decimal value like `39.87` collide with
the native number-input spinner and get visually clipped, reproduced on a real cut), field
slot (label + input + unit suffix) 144px fixed regardless of whether a unit suffix is
present. The fixed slot width is what makes the second field in each row (Out / Volume)
start at the same x across both rows — without it, a 1-character label ("Out") vs a
2-character label ("Volume") plus the presence/absence of a unit suffix shifted
the second input's start position by as much as 24px row to row, which read as the whole row
leaning right. The read-only `Length` text in Range wraps to its own line when the panel is too
narrow to fit all three items on one row (`qf-row` already used `flex-wrap: wrap`) — this is
expected degradation, not a bug.

## 5. (3) Export

**Section order (2026-07-11 fold-in, superseding the "Subtitle style presets" separate-section
design described below)**: **Project** (name, fps, resolution, episode fade in/out, a
narrow-field pair like Width/Height above it) -> **Subtitle style** (folds the global look and
every named, reusable preset into ONE section — `SubtitleStylePresetsSettings` owns an "editing:
global vs. which preset" target select, so what used to be a separate "Subtitle style presets"
section, one Collapsible field-set stacked per preset, is gone; that layout became unwieldy past
a couple of presets) -> **Intro/outro** (select + release, collapsible manual entry) ->
**Background music** (one-line summary only in this step; editing itself lives in the (2) Edit
step — a collapsible side rail for placing/dragging tracks + a top property bar for the selected
track, see section 3) -> **Output** ([Download
subtitles .srt] [Export...] — Export dialog: resolution presets / burn-in subtitles / summary /
start).

**Narration is not currently rendered in this step.** The design below (toggle, folder, volume,
Ducking sub-block) describes a settings component (`NarrationSettings`) that is built and tested
but not wired into this step (or any step) yet — so none of it is reachable from the running app
right now; only per-cut narration file selection (the (2) Edit step's Cut settings) works today.
Wiring it back in is open work (see PRD section 11).

**Ducking** (as designed in `NarrationSettings`, once wired in) — a sub-toggle inside Narration,
shown only while narration itself is enabled: a checkbox ("Duck background music during
narration") that once on reveals a **Duck amount** slider (0-100%, default 60%) and a **Fade
duration** narrow number field (seconds, 0.1-1, default 0.3). No per-cut field exists - ducking
windows are derived entirely from where narration is already placed, so there's nothing to
configure per cut. Unlike Transitions' fade/dip (which has a live opacity-ramp preview on the
video element), there is currently no live BGM/narration audio playback anywhere in the (2) Edit
step's Play all (BGM/narration only get a standalone audition player in their own settings
panels) - so ducking has no in-editor preview, only a note under the group saying so.

**Layout tokens (2026-07-09 revision — fixes the "inputs are tiny and right-skewed" bug)**: a
section's form content is capped at a **readable column width** (620px; 680px for the subtitle
style section, which also holds a preview stage) and left-anchored — the panel itself can be much
wider than that on a large viewport, and that extra width is deliberately left empty on the right
rather than stretched into. Within a row, the **label sits in a fixed 120px column immediately to
the left of its field** — never `justify-content: space-between` (that was the actual bug: with
the section stretched to the full step-body width, space-between threw the label to the far left
and the field to the far right with a large empty gap between, which read as "tiny, right-skewed
inputs" even though the fields themselves weren't small). Field width is chosen by content type,
not by the row: numbers use the shared `narrow` token (80px, same as Cut settings' Range/Playback
groups); short
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
- 2026-07-12 (later, BGM + Cut/Effects overhaul): (1) the Cut/Effects switch moved from an Astryx
  `TabList` to a `SegmentedControl` (radio group) — the two are views of the same cut's settings,
  not separate destinations; 0.1.3 doesn't forward `data-testid`, so tests select by `role="radio"`
  + name (upstream fix facebook/astryx#3852). (2) BGM track editing moved OUT of the right Cut-
  settings column into a **horizontal property bar at the top of the Edit step** (File dropdown +
  preview, Volume, cut Range, Remove, Close/Esc) — the right column now always stays
  SegmentQuickFields. (3) BGM side rail: the add-track "+" moved below the vertical label so it
  stays clickable on tall rails, and the track-count badge always renders (from 0) so adding the
  first track no longer shifts the rail layout.
- 2026-07-12 — reconciliation pass: audited this document against the running implementation
  after a long editing session and corrected the parts that had drifted. Biggest fix: the
  Scenes-card cut number (section 2) is the cut's 1-based **timeline** position, 1:1 with cuts
  (never a duplicate-able overlap count) — the same number shown in (2) Edit. Also: Scenes cards
  no longer carry Set-intro/outro (moved to Edit's Cut actions) and their exclusion/description
  representation changed (scrim on the thumbnail + a colored border, not a full-width banner +
  desaturation; description now clamps/scrolls rather than never truncating); Cut settings
  (section 4) split into Cut/Effects tabs and Reframe moved out to the video toolbar; Playback
  dropped the Speed "x" unit text and gained a Percent icon; Title's shipped presets are
  fade/wordStagger/typing/highlight (not the originally-sketched Gooey/Melt/Particle trio),
  rendered via Remotion with a plain-React/rAF browser preview (`TitlePreview`, no
  `@remotion/player`); Undo/Redo and the video/Play-all transport controls are icon buttons; the
  step nav uses meaning icons instead of step numbers; the Play-all stage is a strict 16:9 box
  with `cqw`-sized subtitles; Export's Subtitle style section folds global + presets together
  (no separate "Subtitle style presets" section) and currently has no Narration section (the
  settings component exists but isn't wired into any step yet); BGM's exact layout is left
  unpinned here while it moves to a collapsible side panel (separate, in-progress work). See
  PRD.md's equivalent sections for the same corrections.
- 2026-07-11 — live-testing QA round, six fixes: (1) Edit-tab video controls' Play button now
  reflects real play state (flips to Pause, section 3); (2) the cut list row's thumbnail removed
  (section 3) - subtitle/scene text + the right-side VideoPreview already identify the cut; (3)
  Scenes cards (section 2) changed to a horizontal thumbnail-left/metadata-right layout with a
  larger thumbnail, per the researched clip-browser convention; (4) the playback-mode toggle
  (Loop range/Full clip) restyled smaller/quieter than the primary Play/Pause button, fixing an
  inverted hierarchy; (5) the "Cut settings" panel title removed (section 4) - the panel's context
  is already obvious while scrolling; (6) the BGM section header restyled onto the standard
  collapsible-section-header convention (chevron + title left, "+ Add track" right, section 3).
- 2026-07-10 — 13-inch density pass (section 3): established **1280x800/1440x900** as this app's
  baseline viewports. The (2) Edit step's cut list column narrowed 480px -> 300px (its row's
  time/badge/actions moved onto a second line to compensate) and the cut settings column narrowed
  424-440px -> a fixed 344px, so all three columns fit side by side at both baseline viewports
  instead of the cut settings column wrapping below the video (previously effectively invisible
  until scrolling past the whole video block). The video column's own size is unchanged - freed
  width goes to it via its existing `flexGrow`. Also fixed a related latent bug in the cut settings
  column's internal-scroll max-height (task #21): it assumed the sticky workspace was already
  pinned to its stuck position, which undercounted the column's real pre-scroll offset. Arrangement
  only - no root font-size/rem scaling, no global token shrink, no Astryx component restyling.
- 2026-07-09 — Section 3's trim UI replaced: the "two-level trim" (overview bar + detail bar,
  which read as an inert box - see CLAUDE.md's "no invented UI patterns" rule) is now **TrimStrip**,
  a single zoomable filmstrip strip plus a scrollbar-styled pan control, adopted from
  `docs/research/trim-ux-conventions.md` section 4 (the Premiere Source Monitor model). The In/Out
  numeric fields (section 4) also gained Up/Down frame-nudge (from `project.fps`) and M:SS.s/
  relative (`+n`/`-n`) text entry.

- 2026-07-09 — Renamed the three `ui/` wrapper components per CLAUDE.md's wrapper-naming rule
  (name states where/why it exists, never how it looks): `CompactButton` -> `ToolbarButton`,
  `CardActionButton` -> `SceneCardButton`, `IoAssignButton` -> `IntroOutroButton`. Rule 0-8 above
  was updated to the new names; earlier changelog entries below still use the old names, as of
  when they were written.

- 2026-07-09 — Scenes card actions (section 2): Add/Remove collapsed into a single state-driven
  toggle button (was two buttons, one always disabled+hidden); Set-as-intro/outro labels shortened
  ("Set intro"/"Set outro") but kept in their existing stacked (not side-by-side) row - judged the
  stacked layout the safer, already-verified-truncation-free option over gambling the shorter text
  fits the tighter side-by-side slot.

- 2026-07-09 — PRD backlog #3 (fades/dip): Cut settings gains **G5. Transitions** (section 4),
  renumbering the former G5-G7 (Narration/Reframe/Cut actions) to G6-G8 - placed after Title,
  before Narration (both Title and Transitions are cut-frame-edge concerns); Export's Project
  section gains an episode fade in/out field pair (section 5).

- 2026-07-09 — PRD backlog #1+#2 (named subtitle style presets, title cards): (1) Cut settings
  gains **G4. Title** (section 4), renumbering the former G4-G6 (Narration/Reframe/Cut actions)
  to G5-G7 - placed after Subtitle (both are text-overlay concerns), before Narration/Reframe;
  (2) Subtitle (G3) gains a Style preset select above the per-cut override; (3) Export gains a
  **Subtitle style presets** section (section 5) directly after the global subtitle style
  section.

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
  `IoAssignButton` under `apps/web/src/components/ui/`) that apply the tweak via `xstyle`
  instead; (3) moving the one-off `.add-button` margin tweak on BgmEditor's Button to inline
  `style`.
- 2026-07-08 first draft — established the fix baseline for the hierarchy collapse (In/Out
  split apart, oversized Speed field, unclear ownership of style overrides).
- 2026-07-08 revision — card-internal spacing rule and excluded-card state representation
  rule (section 2); confirmed G1/G2 width tokens from real measurements (section 4).
