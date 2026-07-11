# PRD — Personal Cuesheet Editor

> 2026-07-08. Product requirements re-derived after features had piled up without a spec and
> the hierarchy collapsed. From now on, every new feature gets a place in this document first,
> then gets implemented. Screen layout is governed by `screen-spec.md`.

## 1. North Star

A personal editor: throw in raw footage and (1) a rough cut is generated automatically,
(2) you polish it in the browser, (3) export finishes the job right there. Two things that
set it apart: it works on footage with no dialogue (vision-based), and it bakes in the
user's own editing grammar (cut rhythm 2.8-3.0s, shot vocabulary, narrative arc, the
chin-line face policy).

## Phase goals (user-declared, 2026-07-09)

1. **Usability up, zero feature regression** — every UX change preserves existing capability.
2. **Astryx as an AI-driven design-system testbed** — the user's AI exercises Astryx to its
   fullest; bugs/gaps found along the way become an upstream fix-proposal list.
3. **Packaged for others** — clean, beautiful, well-ordered code with HIGH test coverage;
   a stranger (or their AI) can clone and use it.
4. **Table-stakes editor features** we deferred for MVP — multiple named subtitle styles,
   title/chapter subtitles, and others the AI should proactively propose and add.

## 2. User and core scenario

Single user (a knitting vlogger). Weekly routine:

```
Shoot -> pnpm episode "<folder>" -> /episode (rough cut done) -> polish in the editor (30-60 min)
-> export (with subtitles / without) + SRT -> upload to YouTube
```

Polish loop, in detail: scan through the edit (J/K/L) -> fix awkward cuts (trim/split/merge/
delete) -> polish subtitles (inline Tab flow) -> style a few standout cuts -> intro/outro ->
export.

## 3. Full feature list (nothing gets dropped — this list is the checklist when reorganizing)

### Header (global)

Save (+ dirty indicator) - Export (via settings dialog) - Undo/Redo (icon buttons:
chevronLeft/chevronRight) - theme toggle (system/light/dark) - keyboard shortcut help (?)

### Step navigation

Scenes -> Edit -> Export, each shown with a meaning icon (Film / Scissors / Download) rather
than a step number. Scenes carries an in-use/total scene-count badge, Edit carries a
subtitled/total-cut-count badge; Export has no badge.

### (1) Scenes (choosing material)

- Scene candidates: cards (thumbnail, clip name, timestamp, scene description, shot-type
  badge, quality)
- Card states: In use (cut N) / Auto-excluded (reason shown: quality or face) — filter
  [All / In use only / Excluded only]. **N is the cut's 1-based position in the timeline's
  ordered cut list, and the mapping is 1:1** — each cut number appears on exactly one card (the
  card that cut was actually assembled from), the same number the (2) Edit step shows for that
  cut. It is never a duplicate-able "how many candidates overlap this cut" count.
- Category filter (shot type)
- A single state-driven [Add]/[Remove] toggle per card (icon-only, bottom-right corner; cards
  excluded for face reasons still need a confirmation prompt before adding)
- Setting a card's clip as intro/outro now happens from the (2) Edit step's Cut actions (see
  below), not from the Scenes card itself

### (2) Edit (polish — single screen, no modes)

- **Cut list**: thumbnail + inline subtitle editing (Tab/Shift+Tab flow) + scene description
  line (badge + note) + per-cut style badge + syncs with the right column on selection
- **Timeline (mini)**: blocks (thumbnail / clip boundary line / current-cut highlight), zoom
  (Cmd+wheel, +/-, Shift+Z to reset), BGM drag
- **Video column (sticky)**: scene header (#n, badge, description) -> video (preview with
  reframe applied, live subtitle + title-card overlay, merged style) -> playback controls (go to
  start, play/pause icon reflecting real play state, mark In/Out, split, capture frame, reframe
  entry point) -> a quieter Loop range/Full clip toggle below the primary controls
- **Play all**: cuts play back to back (double-buffered) inside a strict 16:9 stage (so the
  video never letterboxes and the subtitle sizes correctly), go-to-start/previous/play-pause/next
  cut as icons, speed 1x/1.5x/2x, progress-bar jump, subtitle + scene-hint overlay, editing
  allowed during playback
- **Cut settings** (two tabs, grouping and order per screen-spec section 4): **Cut** tab —
  Range (In/Out/length), Playback (speed/volume), Narration (file picker, preview, length
  warning, shown only when in use), Cut actions (Split Cmd+B / Merge with next cut Cmd+J /
  Duplicate on one row, Set as intro / Set as outro — disabled + reason if the clip is longer
  than 15s — on their own row), Delete (destructive, separated). **Effects** tab — Subtitle
  (+ Subtitle style for this cut: size/color/outline/background/margin, promote to/release from
  global, optional named style preset), Title (text/preset/duration/color/size/backdrop dim),
  Transitions (fade/dip in and out). Reframe is not a Cut settings group — its entry point lives
  on the video toolbar itself (see Video column, above).
- **Keyboard shortcuts**: Space, J/K/L (reverse/pause/play, repeat to speed up), I/O, arrow
  keys, Cmd+B/J/Z/Shift+Z, Tab, ?
- Undo/Redo (icon buttons), 50-deep stack, batches consecutive edits, localStorage
  snapshot-restore banner

### (3) Export (output)

- Project metadata (name/fps/resolution, episode-level fade in/out)
- Subtitle style: one section folds together the global look (font size, color, outline,
  background box, position, edge margin) and every named, reusable style preset a cut can opt
  into — preview updates live in the (2) Edit video column
- Intro/outro: file picker (shows length, disabled above 15s) + collapsible manual entry +
  clear button
- Background music: one-line summary only in this step; editing itself is moving to a
  collapsible side panel (in progress, separate work)
- Narration: on/off toggle, folder, overall volume, Ducking (duck-under-narration amount + fade
  duration), help text — the settings component (`NarrationSettings`) is built and tested but
  not currently wired into any step, so project-level narration settings aren't reachable from
  the running app yet; only per-cut narration file selection (the (2) Edit step's Cut settings)
  works today
- Export dialog: resolution presets (720p/1080p/4K — subtitle metrics scale proportionally),
  burn-in subtitles vs. clean, summary, progress, download
- Subtitle download (.srt)

### Pipeline integration (outside the editor)

scan/assemble CLI - `/episode` command - MCP bridge (get/update) - file-watch auto-refresh -
proxy auto-generation (integrity check) - thumbnail cache - saved-field-loss guard

## 4. Terminology dictionary (canonical UI copy — corrects awkward loanwords and dev jargon)

Screens, docs, and conversation use only the English UI label in the left column. The middle
column is the Korean concept name used in internal docs/conversation. The right column is
banned (dev-internal use only).

**New rule (2026-07-08): UI chrome is English, content is the working language.** Every piece
of UI chrome — buttons, labels, menus, status copy — uses the English label below. Generated
content data (subtitle text, scene descriptions, etc.) stays in whatever language Claude Code
is currently working in (Korean today) — it is not part of this dictionary and is never
translated as UI copy would be.

| English UI label (canonical — what appears on screen) | Korean concept name (docs/conversation) | Banned terms |
|---|---|---|
| **Scenes / Edit / Export** | 장면 고르기 / 다듬기 / 내보내기 | 구성/편집/마무리 (step names) |
| **Cut** | 컷 | segment |
| **Scene** | 장면 | moment |
| **Scene candidates** | 장면 후보 | moment palette |
| **In use / Auto-excluded** | 사용 중 / 자동 제외 | adopted/rejected |
| **Add / Remove** | 담기 / 빼기 | — |
| **Scene description** | 장면 설명 | scene memo |
| **Cut settings** | 컷 설정 | inspector |
| **Range (In/Out)** | 구간(시작/끝) | trim (used alone) — now that the UI itself is English, the I/O shorthand naturally comes back for the keyboard-shortcut label |
| **Speed** | 배속 | — |
| **Volume** | 볼륨 | — |
| **Subtitle** | 자막 | — |
| **Subtitle style for this cut** | 이 컷만 자막 스타일 | per-cut style, styleOverride |
| **Apply to all cuts** | 모든 컷에 적용 | promote to global |
| **Reframe** | 화면 조정 | crop (used alone) — aspect-ratio-preserving reframe/zoom; button label is "Reframe" |
| **Export** | 내보내기 | render |
| **With subtitles / Without subtitles (for CC)** | 자막 있는 영상 / 자막 없는 영상(CC용) | subtitled/clean versions |
| **Timelapse cut** | 빨리감기 컷 | speed connector |
| **Play all** | 전체 재생 | main playthrough |
| **Timeline** | 타임라인 | mini timeline |
| **Unsaved** | 저장 안 됨(●) | dirty |
| **Undo / Redo** | 실행 취소 / 다시 실행 | Cmd+Z / Cmd+Shift+Z |
| **Unsaved edits** | 저장하지 않은 편집 | snapshot, temp copy — surfaced only in the restore banner |
| **Background music** | 배경음악 | BGM abbreviation is fine alongside |
| Keep as-is: Narration, Intro/Outro, Subtitle, Thumbnail | | already natural |

Principle: name a new feature after what the user is doing, register it in this table, then
implement it.

## 5. Non-functional requirements

1. **Hierarchy is rule #1**: every element must belong to an information group, and its
   importance must match its visual weight. Grouping, alignment, and input width follow the
   grid rules in screen-spec. (Top user-stated priority.)
2. **Astryx single components first**: custom code only for domain-specific parts (timeline,
   crop overlay, palette card, video stage). Everything else uses Astryx
   Button/Dialog/Select/Checkbox/Slider/Tabs/Tag/Toast.
3. Full light/dark theme support (the video stage itself stays fixed dark).
4. No lag in lists/thumbnails (lazy) or seeking at 90+ cuts.
5. Data safety: save-time validation (validateCueSheet), saved-field-loss guard, snapshots.

## 6. State model — what "save" means (the basis for copy and UX)

Data has three layers, and the language shown to the user follows this table:

| Layer | What it actually is | Name the user knows |
|---|---|---|
| In progress | in-memory state (draft) | (none — just "what's on screen right now") |
| Auto temp copy | browser snapshot (automatic backup against accidents) | "Unsaved edits" |
| **Source of truth** | cuesheet file on disk | "Saved state" |

**What the user needs to know (the UI explains itself):**
- Save = commits to the file. **Export, SRT, and Claude integration all work off the saved
  copy.**
- The dirty indicator (unsaved dot) = "what's on screen differs from what's saved -> save it."
- The restore banner = "you have unsaved edits from a past session" -> [Continue editing] /
  [Discard and use the saved copy].
- Undo/Redo operate on the screen state and work independent of saving.

**What the user must never see (must not appear in copy):**
localStorage / snapshot / schema / validator / fs.watch / proxy internals / undo stack —
never implementation jargon, only user language ("Unsaved edits," "Preparing video...").
The auto temp copy is never explained proactively; it only surfaces when needed (the
restore banner).

**Copy principle**: status copy is [one line of situation] + [one line of next action].
No warning without an action.

## 7. Success criteria (must be measurable)

- One episode: rough cut is generated automatically with zero intervention, polishing
  finishes within 30-60 minutes
- Draft quality: recall against the answer key is 80%+ (v4 measured at 80.0), mismatches
  under 5%
- Zero face-policy violations in any cut (checked automatically and reviewed before export)
- Export reliability: output passes frame-level verification; failures surface a clear
  cause in the UI

## 8. Error and waiting-state catalog (copy is situation + next action)

| State | User-facing copy (gist) | Action |
|---|---|---|
| Save validation failed | "Can't save: <field path: reason>" | link that jumps to the cut |
| Saved-field loss detected | "The save system needs an update — restart the server and retry" | retry |
| Export failed | summary of the ffmpeg cause | retry / contact |
| Video preparing (proxy) | "Preparing video — will play automatically in a moment" | wait (automatic) |
| Clip missing | "Can't find the source: <filename>" | prompt to check the folder |
| No draft yet (empty state) | "No draft yet — generate one with /episode" | link to the guide |

## 9. Runtime environment and privacy

- macOS + Chrome recommended, ffmpeg-full required (subtitle rendering), local-only —
  **source footage and edits are never sent anywhere** (external services like narration
  generation are used only when the user explicitly opts in)
- Source-immutability principle: neither the pipeline nor the editor ever modifies the
  source footage
- The chin-line face policy is a product requirement: flag it during scanning (vision) ->
  suggest auto-exclusion/reframe -> verify again before export

## 10. Schema compatibility principle

Cuesheet schema extensions are **additive-only, optional fields** — existing cuesheets must
always remain valid. The save path must pass the saved-field-loss guard, and if the server's
and CLI's schema versions ever drift, we choose a loud failure over silent data loss.

## 11. Backlog (in priority order)

The six items below were the active backlog when this document was last written top-to-bottom;
all six have since shipped (some with details that changed from the original design sketch,
noted inline) — kept here, marked shipped, so the design rationale isn't lost, rather than
deleted outright. The **remaining backlog** (still open) is the second, unnumbered-heading list
further down.

1. ~~Named subtitle style presets~~ — **shipped**: reusable presets are assignable per cut via
   the Style preset select in Subtitle (Effects tab), and are created/edited in the Export
   step's single, folded "Subtitle style" section (global look + every preset together — see
   section 3 and screen-spec section 5).
2. ~~Title cards with presets~~ — **shipped**, with the preset lineup changed from the
   originally-sketched Gooey/Melt/Particle/Typing trio (superseded during implementation):
   shipped presets are **fade** (calm scale+opacity entrance), **wordStagger** (each word eases
   in with a stagger), **typing** (typewriter reveal + blinking cursor), and **highlight** (a
   pastel marker sweeps in behind the last word). `segment.title` also carries editable color
   and size (defaults `#ffffff` / 500, font Pretendard, bundled into the render so exports match
   the preview) plus the optional backdrop dim layer (`title.backdrop: {dim: 0-1}`) as designed.
   All four presets render the same way: Remotion, headless frame-capture -> transparent PNG
   sequence -> alpha-overlay composite at render time (no separate ASS/libass path). The browser
   preview (`TitlePreview`) runs the identical animation math in plain React +
   `requestAnimationFrame` rather than `@remotion/player` (which repeatedly failed to animate
   reliably in this Vite+workspace setup — see docs/goals for the history), so it stays
   pixel-identical without a Remotion runtime in the browser; it auto-loops with no
   play/pause/restart controls of its own (a floating control chip used to overlap the burned-in
   subtitle).
3. ~~Fades~~ — **shipped** as designed: `segment.transitionIn?`/`transitionOut?` (Transitions
   group, Effects tab) and project-level `fadeInS`/`fadeOutS` (Export's Project section).
4. **Audio ducking** — schema/render shipped as designed (`narration.ducking?: {amount, fadeS}`,
   volume-automation over the narration windows) and a settings component exists
   (`NarrationSettings`: a Ducking row — toggle + amount slider + fade-duration field — inside
   Narration) — but that component isn't wired into any step yet, so there is currently no way to
   reach it (or any other project-level narration setting: on/off, folder, volume) from the
   running app. Only per-cut narration file selection (the (2) Edit step's Cut settings) works
   today. Wiring `NarrationSettings` into a step is the remaining work.
5. YouTube chapter list generation from no-subtitle gaps (grammar: gaps = chapter breaks) —
   **prototyped**: `scripts/youtube-chapters.mjs` derives a chapter list from a cuesheet and
   prints `m:ss Title` lines to paste into a YouTube description. Not yet integrated into the
   editor UI/export flow.
6. ~~Thumbnail frame capture~~ — **shipped**: `GET /api/frame-capture?clip=<name>&atS=<source-
   seconds>` extracts a full-resolution PNG from the original clip server-side; the Edit step's
   video toolbar has a "Capture frame" button that captures the current preview position mapped
   to source time.

### Remaining backlog (unprioritized)

1. Detect "mistake / frog it and restart" narratives (frame comparison across the timeline —
   target 90%+ recall)
2. Bulk narration-generation integration (ElevenLabs, after the user sets up an account)
3. Run the lowkey episode (source footage needs re-downloading)
4. Improve the editor's empty state / onboarding

## 12. Non-goals (not doing these)

Multitrack - effects/template marketplace - transcript-based features - going general-purpose
(OpenCut's territory) - collaboration.
