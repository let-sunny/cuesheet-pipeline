# First episode: footage folder to a reviewable rough cut

The one authoritative walkthrough for taking a new episode from a raw footage folder to a
rough cut you can review and export. Run the steps in this order. Every step lists the command,
what it produces, and the symptom to look for if it went wrong.

There are two phases and they are **not** the same command: `pnpm episode` prepares the
material and opens the editor; the actual draft (which moments to use, the cut list, the
subtitles) is produced by the `/episode` pass in Claude Code. Skipping the second phase leaves
you staring at an empty editor.

## 0. One-time setup

```bash
pnpm install
pnpm -r build
```

`pnpm -r build` is required before Claude Code attaches: the MCP bridge (`cuesheet-bridge`) only
exists as `packages/bridge/dist/index.js` after a build. ffmpeg must be on `PATH`; on macOS the
default Homebrew `ffmpeg` lacks `drawtext`, which subtitle burn-in needs — install `ffmpeg-full`
(see [the render README](../packages/render/README.md) and the main
[README prerequisites](../README.md#prerequisites)).

## 1. Scan + boot the editor

```bash
pnpm episode "<raw footage folder>"
```

What it does: validates the folder, counts iCloud not-yet-downloaded files, runs `scan`
(seek-based frame extraction at length-keyed intervals), and launches the editor at
`localhost:5173`. Artifacts land under `media/drafts/<slug>/` (`manifest.json`, `frames/`).

**It does not produce a draft.** If you open the editor now, Scenes is empty — that is expected
until phase 2.

- **Symptom → cause:** *Editor opens but Scenes is empty* → you have not run `/episode` yet
  (this is the single most common confusion). *Most clips report "not downloaded"* → they are
  iCloud placeholders; the scan skips them by design (it checks block count, never reading a
  placeholder). Download the originals if you need them.

## 2. Generate the draft (in Claude Code)

```
/episode <raw footage folder>
```

What it does, start to finish: **vision judgment** (parallel subagents read the extracted
frames and write `moments.json`) → **assemble** (moments → a validated cuesheet at
`episodes/<slug>.cuesheet.json`) → **subtitles in your voice** (per `docs/voice-guide.md`) →
**face-crop suggestions** → **validation**. It hands off with the editor pointed at the
resulting cuesheet. It does **not** render — polishing is yours.

You do not strictly need the slash command: asking Claude Code in natural language ("make a
rough cut from this folder") runs the same procedure. `/episode` just codifies it.

Expected cost/time (*measured 2026-07-12, so treat as an order-of-magnitude, not a contract*):
the vision stage fanned out ~8 Sonnet subagents over ~8 locally-present clips (~340k subagent
tokens, ~100s wall-clock in parallel). A full local set is ≈ 15 subagents. iCloud-evicted clips
are out of scope and are not downloaded. Assemble/validate are sub-second; a representative
subset render was ~25s. See [docs/token-usage.md](./token-usage.md) for a full cost breakdown.

- **Symptom → cause:** *The bridge's tools look wrong/incomplete, or descriptions are stale* →
  the attached bridge is a pre-build `dist`; restart the Claude Code session after `pnpm -r
  build` (the bridge prints a startup banner to stderr naming its version, file, and tools).
  *Long frontal-face takes contribute cuts but zero timelapse connectors* → correct: the face
  policy suppresses connectors on face-exposed ranges; take the vertical-crop suggestion to keep
  the footage usable.

## 3. Polish in the editor

Open `localhost:5173` and work left to right: **① Scenes** (accept/remove candidate moments,
set intro/outro) → **② Edit** (per-cut range, subtitle, speed/volume, title, transitions) →
**③ Export** (subtitle style, BGM, resolution). See [USER-GUIDE.md](./USER-GUIDE.md) for the
full editor reference — this page does not duplicate it.

If the editor is showing a different episode than the one you just built, it was started before
this episode became active; just restart it (`pnpm --filter @cuesheet/web dev`) — it reads the
active episode from `.active-episode`, which `pnpm episode` wrote.

## 4. Export

From ③ Export, save, then render (choose resolution and whether to burn in subtitles). Output
lands at `out/<project name> <timestamp>.mp4`. Or from the CLI:

```
cuesheet-render episodes/<slug>.cuesheet.json out.mp4
```

- **Symptom → cause:** *Render fails / subtitles missing* → the `ffmpeg` on `PATH` lacks
  `drawtext`; use `ffmpeg-full` (step 0). *A multi-minute render appears to hang* → it is
  synchronous; macOS has no `timeout(1)`, so bound it with `gtimeout` or run it in the
  background.
