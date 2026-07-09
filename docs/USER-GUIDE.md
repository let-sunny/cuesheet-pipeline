# User Guide — Personal Cuesheet Editor

> Audience: the owner of this tool (a knitting YouTuber). Answers "what do I do" when you open
> the editor.
> Starting a new episode: `pnpm episode "<raw footage folder>"` (scans and launches the editor
> automatically) — see section 1 below.
> Reopening just the editor: from the repo root, `pnpm --filter @cuesheet/web dev`, then open
> `localhost:5173`
> (the file being edited is set via `CUESHEET_PATH` when starting the server — defaults to
> `project.cuesheet.json`).

---

## 1. Full flow (from footage to upload)

```
footage folder ──▶ rough cut generated (automatic) ──▶ polish in the editor (you) ──▶ final export
              scan + vision judgment      ① Scenes ② Edit ③ Export        subtitled mp4
              + assembly + draft subtitles                            clean mp4 + SRT
```

Starting an episode is one line:

```bash
pnpm episode "<raw footage folder path>"
```

This command handles the mechanical parts (validating the folder, checking the iCloud
not-yet-downloaded count, running `scan`, launching the editor server, opening the browser),
and tells you the next step at the end. Follow it by running this in Claude Code:

```
/episode <raw footage folder path>
```

This custom command runs vision judgment (moment detection) -> assembly -> subtitles in your
voice -> face-crop suggestions -> validation, start to finish, and hands off with the editor
already looking at the resulting cuesheet. It does not render automatically — polishing in the
editor from there is your job.

(Note) You don't need `/episode` — you can just ask in natural language any time, e.g. "make a
rough cut from this folder," and Claude Code will run the same procedure on its own.
`/episode` just codifies that procedure so it repeats the same way every time.

## 2. Polishing in the editor (the edit flow)

### ① Scenes — picking material
- **Scene candidates**: cards for automatically detected "usable scenes" (clip, thumbnail,
  scene description, quality). Sorted chronologically.
- **[Add]** on a card = add the cut to the timeline (keeps shooting order). **[Remove]** takes
  it out.
- **[Set as intro] [Set as outro]** on a card, one click (clips over 15s are auto-disabled).

### ② Edit — adjusting cuts
- Select a cut in the cut list (thumbnails) -> adjust it in **Cut settings** on the right:
  - **Range**: drag the In/Out handles or type numbers (updates the preview instantly)
  - **Subtitle**: edit the text (see the "Voice" section below) — a **style preset** select
    appears here too, once you've created any presets in ③ Export (see below)
  - **Speed/Volume/Narration/Reframe**
  - **Title**: turns on a title card at this cut's start — text, one of 4 presets
    (typing/gooey/melt/particle), duration, backdrop dim (darkens behind the card)
  - **Transitions**: independent fade/dip at this cut's start (transition in) and end
    (transition out) — dip lets you set how dark it goes (less than fully black), fade always
    goes fully black
- **Capture frame**: camera-icon button on the preview — grabs a full-resolution PNG of the
  current preview position straight from the original clip (crop is not applied to the
  capture) and downloads it. Handy for pulling a thumbnail candidate without leaving the editor.
- **Play all**: the play button up top -> cuts play back to back (with subtitle overlay, and
  now real audio too — BGM/narration actually play, including the ducking dip, so you can hear
  the mix before exporting instead of only seeing it).
  You can keep editing below while it plays — click a cut in the list to play from there.
  Controls: previous/next cut, speed 1x/1.5x/2x, click the progress bar to jump.
- **Shortcuts**: Space play/pause · I/O set in/out · arrow keys to move ·
  Cmd+B split cut · **Cmd+Z / Cmd+Shift+Z undo/redo** · ? help · Tab move through subtitles
- Leaving before saving still lets you recover via the "Unsaved edits" banner — click
  [Continue editing], and save once you're happy with it.

### ③ Export — style and output
- **Project**: name/resolution/fps, plus **episode fade in/out** — a fade to/from black at the
  very start/end of the whole export (0-3s, off by default).
- **Subtitle style**: color picker + background box (color/opacity/margin — a YouTube-default
  subtitle look) + edge margin slider. Preview updates live in the ② Edit video.
- **Subtitle style presets**: save a named variant of the subtitle style (e.g. a bigger yellow
  "shout" look) once here, then assign it to individual cuts from the style preset select in
  ② Edit's Cut settings — no need to hand-set the same override on every cut that wants that look.
- Review/clear **intro/outro**, **BGM**, **narration** (see section 4 below), including
  **ducking** (dip the BGM automatically while narration plays — amount/fade-in-out shape are
  both adjustable, and audible in-editor via Play all, not just in the final export).
- **Export**: save, then hit the export button -> pick resolution (720p/1080p/4K) and whether
  to burn in subtitles (shows progress %, downloads when done). The rendered file is saved to
  this project's `out/<project name>.mp4` on the server, and the button also offers it as a
  direct download.
  - **Check "Without subtitles (for CC)"** = for uploading as YouTube CC
  - **"Download subtitles (.srt)"** = a separate subtitle file (for CC upload)
- Upload combos: **clean video + SRT as CC**, or a subtitled video on its own.

### What "save" means
- **Save = commits to the file.** Export, SRT, and Claude integration all work off the saved
  file.
- The header's **● Unsaved** = the screen differs from the saved file -> needs saving.
- An automatic temp backup runs while you edit, so even if the tab closes, you can recover it
  next time via the "Unsaved edits" banner. Click [Continue editing] then save to commit it,
  or [Discard] to start from the saved file.

## 3. Voice (when you don't like the subtitles)

Subtitles are auto-written based on `docs/voice-guide.md` (voice rules distilled from 8 of my
own past subtitle sets). Principle: **content comes from the screen, only the tone comes from
the guide.** A subtitle saying something not on screen is a bug.

- **Fixing one or two**: editing directly in the editor is fastest (Cmd+Z works).
- **Several / an overall tone pass**: ask Claude Code — e.g. "tone down the ~ across all the
  subtitles," "rewrite these cuts' subtitles based on what's on screen." It follows voice-guide
  automatically.
- **Changing the voice itself**: edit `docs/voice-guide.md` directly, or tell me "add a ~ rule
  to the guide." Every subtitle written after that follows it.
- Rule summary: only half the sentence-endings get the softened variant (~여/~져), "고앵이"
  (never "고양이"), aim for 25 characters (matches the 3-second rhythm), no line breaks, no
  emoji, finished-object cuts get "짜잔," the last cut gets "안녕~~."

## 4. Using narration

Structure: **drop an audio file in the folder -> link it to a cut -> render mixes it in at that
cut's start time.**

1. In ③ Export, turn on **"Use narration"** and point it at a folder (default suggestion:
   `media/narration`)
2. Drop audio files (mp3/m4a/wav) into that folder — the list refreshes automatically
3. In ② Edit, select a cut -> pick a file from the **"Narration" select** in cut settings
   (shows its length)
4. **Preview** it right there. If the file is longer than the cut, you get a "N seconds long —
   overlaps the next cut" warning
5. Mixed in automatically at render time (adjust overall narration volume in Export)

### How to make the audio files (ElevenLabs voice cloning)
1. Sign up at elevenlabs.io -> **Starter plan ($5/month)** — the free tier bans commercial use,
   so it's a no
2. Voices -> Instant Voice Cloning -> upload 1-2 minutes of your voice sample (quiet room,
   normal speaking voice)
3. In Text to Speech, pick your voice -> type the subtitle sentence -> generate -> download the
   mp3
4. Drop the file into the narration folder and continue from step 3 above
- For bulk generation (a whole episode), ask me — I can run an SRT-based per-sentence
  generation script (needs an API key).

## 5. Automation pipeline (reference)

- **scan**: raw folder -> frame extraction at a length-keyed interval
  (`cuesheet-draft scan <folder> --out <workdir>`)
- **Vision judgment**: Claude looks at the frames and records scene/monotonous-range/face-
  exposure info (moments.json)
- **Frogging detection**: 5+ minute long takes get compared frame-pair by frame-pair to extract
  mistake/frogging moments (progress.json)
- **assemble**: adopts quality 3+, converges cut rhythm to a 2.8-3.0s average, inserts
  timelapse cuts, validates and saves
- **Face policy**: faces (yours + family's) show **chin-line and above only** — flagged at the
  judgment stage, violating cuts get auto-cropped to vertical (removable in the editor)
- Detailed figures and verification records live in `docs/STATUS.md`

## 6. If something goes wrong

- **Video shows black**: hard refresh (Cmd+Shift+R). If that doesn't fix it, the proxy may need
  regenerating — ask me.
- **Save fails with 400 "field loss detected"**: the server is running stale code — restart the
  dev server.
- **Export fails**: check the ffmpeg message in the error banner, usually a clip path/codec
  issue — ask me.
- Whenever anything's unclear: just tell Claude Code what's happening. The editor keeps an automatic
  local backup of unsaved edits (restore banner), and saved states can be recovered
  by asking Claude Code.
