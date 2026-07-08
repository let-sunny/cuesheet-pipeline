# @cuesheet/web

A browser editor for editing a cuesheet (`CueSheet` JSON) and running the render. The touch-up
stage of "my personal Vrew" — the screen where a human refines the rough cuesheet that
`@cuesheet/draft` produced.

Made up of three steps (`StepNav`):

1. **Scenes** — browse the moment candidates the rough-cut pipeline pulled out
   (`MomentPalette`) and pick which cuts go into the final edit.
2. **Inspector** — adjust in/out, speed, volume, subtitle, and crop (distortion-free
   ratio-locked + resizable) per cut, plus per-cut subtitle style overrides
   (`SegmentStyleOverride`). Merging adjacent cuts and reordering also happen here.
3. **Finishing** — set project metadata, the global subtitle style, narration, BGM,
   intro/outro, and a render-resolution preset (720p/1080p/4K — switching scales subtitle
   size/margin/outline proportionally to the height ratio, `subtitleScale.ts`), then run the render.

## Running

```bash
pnpm --filter @cuesheet/web dev
```

Defaults to http://localhost:5173 (Vite's default port).

## CUESHEET_PATH / MOMENTS_PATH

The cuesheet being edited is specified via `CUESHEET_PATH` (default: repo root
`project.cuesheet.json`). The moment-candidate list shown in the Scenes step (`moments.json`,
the same format as `@cuesheet/draft`'s `assemble` input) is specified via `MOMENTS_PATH`
(default: `media/drafts/dotmix_v4/moments.json`).

```bash
CUESHEET_PATH=/path/to/other.cuesheet.json pnpm --filter @cuesheet/web dev
```

## Save / validation

`POST /api/cuesheet` validates with `validateCueSheet` before saving. On failure, it returns
`field-path: reason` style messages and doesn't save — any cuesheet that passes saving in the
web app is guaranteed to pass render too (same schema).

## Running a render

The render button in the Finishing step calls `POST /api/render`. It reads the cuesheet saved
on disk, reuses `@cuesheet/render`'s `buildRenderPlan` as-is to run ffmpeg, and produces
`out.mp4` at the repo root (downloadable via `GET /out.mp4`). The button is disabled while
there are unsaved (dirty) changes, and a concurrent request while a render is in progress is
rejected with 409 (a module-scope flag, no queuing). Progress is polled via `GET /api/render/status`.

## Subtitle download

`GET /api/subtitles.srt` converts the saved cuesheet's segments to SRT and serves it (the
conversion logic lives in `@cuesheet/render`'s `src/srt.ts` — a pure function, so it's reusable
from scripts/CLIs too).

## Live refresh

The dev server watches the target cuesheet file via `fs.watch`. When the file changes
(including natural-language edits via the bridge), it sends a `cuesheet:changed` event over the
HMR channel, and the web app re-fetches `/api/cuesheet` on receiving it to refresh the screen
immediately. No manual reload needed.

## Build / typecheck

```bash
pnpm --filter @cuesheet/web build      # tsc --noEmit + vite build
pnpm --filter @cuesheet/web typecheck  # tsc --noEmit
```
