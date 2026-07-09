# Trim UX conventions: precise short-range trims out of long source clips

Research date: 2026-07-09. Question: how do established editors let a user trim a short
range (2-5s) out of a long source clip (up to 40min) with precision — the exact interaction
our Edit step needs (per-cut in/out adjustment against the source, inside a fixed-width
panel column under the preview video)?

Related prior docs: `editor-ux-benchmark.md` (feature-level benchmark),
`nle-conventions-vlogger-workflow.md` (general NLE conventions). This doc is narrower:
only the trim-a-range-from-a-long-source interaction.

## 1. Per-editor findings

### 1.1 Premiere Pro — Source Monitor (the closest analog to our panel)

The Source Monitor is exactly our situation: one video preview with one scrub bar under
it, used to mark a sub-range (in/out) of a source clip before it goes to the timeline.

- **Single time ruler + zoom scroll bar underneath.** The ruler shows the playhead, In,
  and Out as draggable icons. Directly under it sits a "zoom scroll bar": dragging its
  **end handles inward shrinks the bar and zooms the ruler in**; dragging the bar's body
  pans the zoomed view; hovering the bar and using the **mouse wheel contracts/expands
  it** (zoom in/out). So precision on a long clip = squeeze the scroll bar until the
  ruler shows only the region you care about, then drag In/Out or use keys.
- **Playhead-anchored marking is primary.** The canonical workflow is: navigate the
  playhead (JKL shuttle, arrow keys, scrub), press **I** to mark In, **O** to mark Out.
  Dragging the In/Out icons on the ruler is the secondary, coarse method.
- **Frame nudging (trim shortcuts).** Alt/Option+Left/Right trims the selected edit
  point by 1 frame; Alt/Option+Shift+Left/Right by the "Large Trim Offset" (default
  5 frames, user-configurable in Preferences > Trim).
- **Timecode hot-text.** Timecode fields accept shorthand: digits without separators are
  frames, with separators it is parsed as timecode; `+n`/`-n` moves relatively.

Sources:
- https://helpx.adobe.com/premiere/desktop/get-started/source-and-program-monitor-adjustments/time-controls-in-the-source-and-program-monitors.html
- https://www.nobledesktop.com/learn/premiere-pro/trimming-and-editing-clips-with-premiere-pros-source-monitor
- https://larryjordan.com/articles/five-hidden-keyboard-shortcuts-to-faster-trimming-in-adobe-premiere-pro/
- https://helpx.adobe.com/premiere-pro/using/trim-mode-editing.html

### 1.2 Final Cut Pro — trimming + Precision Editor

- **Frame nudging:** comma/period moves the selected edit point 1 frame left/right;
  **Shift+comma/period moves 10 frames**. Numeric relative moves: press `+` or `-`,
  type an amount (seconds and/or frames), press Return — e.g. `+12⏎` = 12 frames right.
- **Precision Editor** (double-click an edit point, Esc to close): an expanded two-lane
  view around one edit point. The key design idea: **used media is bright, unused media
  (handles) is dimmed but visible in the same filmstrip** — you see exactly what footage
  you would gain by extending, and you can click any frame in the dimmed area to move the
  edit point straight there. At maximum extension the clip edge turns red.
- Takeaway for us: FCP earns precision not with an abstract zoom widget but by rendering
  **more actual footage (film-strip frames)** around the point being adjusted.

Sources:
- https://support.apple.com/guide/final-cut-pro/use-the-precision-editor-verc1fac344/mac
- https://support.apple.com/guide/final-cut-pro/extend-or-shorten-clips-ver9847ec25/mac
- https://larryjordan.com/articles/fcpx-precision-editor/

### 1.3 CapCut (desktop + mobile)

- **Desktop:** precision = **timeline zoom**. Ctrl/Cmd+wheel (or Ctrl `+`/`-`) zooms the
  clip strip; arrow keys nudge the playhead 1 frame; Ctrl+B splits at the playhead. The
  documented workflow for a precise trim on a long clip is literally "zoom in as far as
  needed, then drag the clip-edge handles / split at the playhead".
- **Mobile:** the same model with touch: **pinch-out on the clip strip zooms in**; drag
  the thick end-handles of the clip to trim. Guides tell users to zoom fully in before
  dragging for frame accuracy. No magnifier/loupe — the strip zoom IS the precision
  mechanism, and the strip shows filmstrip thumbnails so a zoomed view stays meaningful.

Sources:
- https://tutorialtactic.com/blog/capcut-shortcuts/
- https://stephenfrowe.com/archives/111
- https://www.createthat.ai/blog/how-to-cut-in-capcut
- https://sendshort.ai/guides/capcut-zoom/

### 1.4 Descript / YouTube Studio / DaVinci Resolve Cut page

- **Descript:** transcript-first, but for non-speech precision it falls back to a
  conventional timeline: **zoom in on the waveform/strip, drag clip edges**; a Slip tool
  shifts in/out within a clip without changing timeline length. Same "zoom the one strip"
  model.
- **YouTube Studio editor:** minimal trim UI, but even here: a **zoom slider** beside the
  timeline, comma/period for frame stepping, and a timecode readout next to the trim
  handles. Notable: the absolute floor for "trim a long video on the web" still includes
  a zoom control and frame-step keys.
- **DaVinci Resolve Cut page — dual timeline (closest to what we built):** upper strip =
  the **entire program**, used for navigation and rearranging; lower strip = a
  **fixed-zoom detail view that always centers on the playhead**. Two properties matter:
  (1) **neither strip has a user-controlled zoom** — there is no "window" object to
  manage; the linkage between the two strips is the playhead itself, one anchor the user
  already understands; (2) both strips are real timelines rendering clip thumbnails, so
  each strip is legible on its own. For frame-fine work, grabbing an edit point
  additionally opens a **trim editor filmstrip in the viewer** with individual frames
  visible (same instinct as FCP's Precision Editor: precision = show more frames).

Sources:
- https://help.descript.com/hc/en-us/articles/10249344527501-Advanced-timeline-tools
- https://www.vp-land.com/p/every-edit-tool-in-descript-s-timeline-explained
- https://support.google.com/youtube/answer/9057455
- https://primalvideo.com/video-creation/editing/how-to-edit-videos-with-the-youtube-video-editor/
- https://www.blackmagicdesign.com/products/davinciresolve/cut
- https://www.danielgrindrod.com/blog/cutpage
- https://larryjordan.com/articles/get-started-editing-in-the-davinci-resolve-cut-page/

### 1.5 Cross-editor keyboard/numeric conventions

- Frame step / nudge: 1 frame on a bare key (arrows, or comma/period), a **bigger step
  with one modifier** — Shift+comma/period = 10 frames (FCP), Alt+Shift+arrows = large
  trim offset, default 5 frames (Premiere), Shift+arrows = 1 second (Kdenlive, and our
  current binding).
- JKL shuttle is universal (we already have it).
- Numeric entry: relative offsets (`+12`, `-40`) and shorthand timecode parsing are the
  pro-NLE norm; nobody requires typing full HH:MM:SS:FF.

Sources:
- https://docs.kdenlive.org/en/cutting_and_assembling/editing.html
- https://www.shotcut.org/howtos/keyboard-shortcuts/
- https://www.peachpit.com/articles/article.aspx?p=3150365&seqNum=6

## 2. Common denominators (what EVERY editor does)

1. **One interactive surface, precision via zoom of that same surface.** No mainstream
   editor gives you two permanently-visible abstract bars to coordinate. Either the
   single strip zooms (Premiere zoom scroll bar, CapCut Ctrl+wheel/pinch, Descript,
   YouTube zoom slider), or — Resolve Cut page — the second strip is a full auto-zoomed
   timeline linked by the playhead, with no window object to manage.
2. **The playhead is the anchor.** Navigate to a frame (scrub, JKL, frame-step), then
   command "In here" / "Out here" (I/O). Handle-dragging exists but is the coarse path.
3. **The trimming surface shows content** — filmstrip thumbnails, waveform, or at minimum
   a labeled time ruler. Zooming is meaningful because what you see changes.
4. **Frame-step keys with a modifier for a larger step**, everywhere.
5. **Numeric timecode entry as the escape hatch**, with relative (`+n`/`-n`) input.
6. When frame-perfection matters, editors **show individual frames** near the edit point
   (FCP Precision Editor, Resolve trim editor filmstrip).

## 3. Why Resolve's dual timeline works but our two-level attempt read as a dead blue box

Our current implementation (`apps/web/src/components/VideoPreview.tsx` +
`lib/trimWindow.ts`): an "overview" bar (full clip, 20px tall, 4px track) with a
translucent accent-bordered rectangle showing the detail bar's zoom window, above a
"detail" bar (28px, 4px track) carrying the In/Out handles. Diagnosis, against the
conventions above:

1. **No content in the bars.** Both bars are featureless 4px tracks. Resolve's two strips
   are real timelines with clip thumbnails; Premiere's ruler has ticks and numbers. Our
   window rectangle is an empty box drawn over an empty bar — nothing inside it changes
   when it moves, so it communicates nothing and reads as decoration.
2. **Proportion collapse.** On a 40-min source, the default 20s window is ~0.8% of the
   overview width — a few pixels. The cut's 2-5s in/out range on the overview is
   sub-pixel (invisible). So the overview displays: an empty bar, an invisible range, and
   a sliver of a box. "Dead blue box" is the accurate reading of what is rendered.
3. **Wrong linking abstraction.** Resolve links its two strips with the **playhead** —
   an object the user already tracks; and it deliberately offers **no zoom control**, so
   there is no viewport object at all. We introduced a third abstraction (the "window")
   that is neither playhead nor in/out, and the user must learn it from an 11px caption.
   Instruction-as-label ("click/drag to move the zoomed-in window below") is itself the
   signal that the control does not explain itself.
4. **No interaction affordances on the box.** `.trim-overview-window` has
   `pointer-events: none`, no hover state, no edge handles, no cursor change. The actual
   interaction (click anywhere on the overview to re-center) is invisible, and the one
   thing the box's border suggests (drag me, resize me) is not implemented.
5. **Fixed window width.** The window width only resets on cut selection; there is no
   zoom in/out. Precision is capped at whatever `computeDefaultTrimWindow` chose, and the
   user cannot widen to re-orient or narrow to fine-tune — the two moves every real
   editor's zoom gives.

## 4. Adoption proposal (concrete spec for our panel)

Constraints: one panel column under the preview video; mouse+keyboard; existing pieces to
reuse: I/O keys and Set-In/Set-Out buttons, arrows ±1 frame / Shift+arrows ±1s, JKL
shuttle, `useNumericField` in/out fields, `SegmentThumb` (seek-based thumbnails via
proxies), `MiniTimelineStrip`'s Ctrl/Cmd+wheel zoom convention.

**Direction: replace the two abstract bars with ONE zoomable filmstrip strip plus a
scrollbar-shaped pan control** — the Premiere Source Monitor model, with CapCut's
zoom gesture and FCP-style filmstrip content. Keep the playhead+I/O workflow primary
(it already matches every pro NLE).

### 4.1 The strip (replaces both current bars)

- One scrub strip, full panel width, height ~48px, rendering **filmstrip thumbnails** of
  the visible time range (reuse `SegmentThumb` frames at a fixed pixel stride, e.g. one
  thumb per ~64px; thumbnails load lazily and can be cached per (clip, t) — same
  mechanism `MiniTimelineStrip` already uses). If thumbs are unavailable, fall back to a
  time ruler with labeled ticks — never a blank track.
- Overlaid, exactly as today: shaded in..out range, In and Out drag handles (keep 12x20px
  hit areas), playhead line. Keep `MIN_GAP` enforcement and pointer-capture drag code —
  the drag logic is fine; only the surface it lives on changes.
- The strip maps `[viewStart, viewEnd]` (rename of `trimWindow` — it is a viewport, not
  the trim) to its width. Default on cut selection: current in/out padded 30%, min 20s —
  keep `computeDefaultTrimWindow` as-is.

### 4.2 Zoom mechanism

- **Ctrl/Cmd+wheel over the strip zooms, centered on the cursor's time position**
  (same modifier convention as `MiniTimelineStrip`, so the app has one zoom gesture).
  Factor 1.2 per notch, same as the mini strip.
- **`+` / `-` buttons and a "Fit cut" / "Fit clip" pair** in a small row at the strip's
  right end. Button zoom centers on the playhead. "Fit cut" = `computeDefaultTrimWindow`
  again; "Fit clip" = [0, duration]. Zoom bounds: max out = full clip; max in = viewport
  no narrower than 1s (at panel width that is ~20px/frame at 30fps — frame-accurate).
- **Shift+Z** = Fit clip (matches the mini strip's fit shortcut).

### 4.3 The pan control: style it as a scrollbar, not an "overview"

Under the strip, a slim (~10px) horizontal scrollbar-shaped control, shown **only when
zoomed in past Fit clip** (when fit, it disappears — nothing dead on screen):

- A thumb whose position/width = viewport within [0, duration]. Drag body to pan; click
  the trough to jump; **drag thumb edges to change zoom** (Premiere's zoom scroll bar,
  and also simply how every scrollbar-with-zoom works — a learned affordance, unlike our
  labeled window box). Cursor changes (`grab` on body, `ew-resize` on edges) and a hover
  state are required — this is precisely what the dead box lacked.
- Inside the trough, a 2px accent tick marks where the cut's in..out is, so the user can
  always see "where my cut lives in the whole clip" even at sub-pixel scale (draw it with
  a minimum 2px width instead of letting it vanish).
- No caption. If we keep any text, it is the readout we already have
  ("Now / In / Out"), extended with the visible-range when zoomed.

### 4.4 Keyboard and numeric precision (small deltas to existing code)

- Keep: I/O set-at-playhead, Left/Right ±1 frame, Shift+Left/Right ±1s, JKL, Space.
  One fix: `FRAME_SECONDS` is hardcoded 1/30 — derive from `project.fps`.
- **Add stepper keys inside the In/Out `useNumericField` inputs**: Up/Down = ±1 frame
  (1/fps), Shift+Up/Down = ±1s, commit immediately. This gives per-handle frame nudging
  without inventing new global shortcuts or an edge-selection model, and reuses the
  existing fields. (Premiere/FCP equivalents: timecode hot-text and +/- entry.)
- **Relative entry in those fields**: accept `+0.5` / `-2` as "current value plus/minus"
  (FCP's `+`/`-` convention translated to our seconds-based fields), and accept `1:23.4`
  as 83.4s alongside plain seconds. Pure parser change in `useNumericField`'s coerce path.
- Optional (cheap, high leverage while adjusting): when a handle is dragged or a numeric
  field commits, seek the preview to that handle's time — every NLE shows the trimmed
  frame while trimming; we already have the `<video>` element right above.

### 4.5 What we explicitly do not build

- No second permanently-visible timeline (Resolve's works because both strips are real
  content-bearing timelines with a playhead link and no window object; in one panel
  column we do not have the vertical room to do that honestly).
- No magnifier/loupe, no separate precision-editor mode: at max zoom (1s viewport) the
  filmstrip already shows ~individual frames, which is what FCP/Resolve's precision
  modes exist to provide.
- No timecode-with-frames display; the project convention is seconds (schema stores
  seconds), so fields stay seconds-based with `M:SS.s` parsing as a convenience.

### 4.6 Suggested build order

1. Merge the two bars into the single zoomable strip (logic reuse: `trimWindow.ts`
   becomes the viewport; handle-drag code unchanged). Filmstrip thumbnails + fallback
   ruler.
2. Ctrl/Cmd+wheel zoom + `+`/`-`/Fit buttons + Shift+Z.
3. Scrollbar-styled pan control with zoomable thumb edges + always-visible 2px cut tick.
4. `useNumericField` stepper keys + relative/`M:SS.s` parsing + seek-on-commit;
   `FRAME_SECONDS` from `project.fps`.
