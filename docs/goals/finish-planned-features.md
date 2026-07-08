# Goal: finish planned features + ffmpeg environment + editing convenience

## Goal
Bring CLAUDE.md's "planned" features to actual working state:
the web hand-editing editor, render real encoding (E2E), ffmpeg environment setup. Convenience-improving additions/structural changes are allowed.

## Scope
Included:
- ffmpeg install (brew) and render E2E verification — produce an actual mp4, confirm with ffprobe
- Generate sample clips for testing (repo-local `media/clips/`), update the seed cuesheet's clipDir
- web: promote viewer to editor
  - segment editing (in/out/speed/volume/subtitle), add/delete/reorder
  - project settings, subtitle style, BGM editing
  - save API (Vite middleware POST) + `validateCueSheet` verification, errors shown as `field path: reason`
  - clip static serving + `<video>` segment-range preview (core convenience feature)
- Verification: `pnpm -r typecheck && pnpm -r test` green + real runtime observation

Excluded:
- expanding bridge tools (the 2-tool design is intentional — keep as is)
- a render-trigger button in the web UI (the CLI is sufficient for rendering; candidate for the next cycle)
- schema expansion (transitions/fades, etc.) — not this time, only when a kind of edit actually becomes needed

## Deliverables
- `media/clips/` sample clips + updated `project.cuesheet.json`
- web editing UI + save endpoint + video preview
- `out.mp4` produced by render E2E (deletable after verification)
- CLAUDE.md "current state" update

## Constraints (CLAUDE.md)
- time unit is seconds, clips referenced by filename only, types derived via z.infer, no emojis
- validation messages use the `field path: reason` format, both web and render use validateCueSheet

## Assumptions
- clipDir `<home>/videos/clips` does not actually exist -> change to repo-local `media/clips`.
  Once real clips exist, only clipDir needs to change (as the schema was designed to allow).
- Sample clips are generated with ffmpeg testsrc/sine (no copyright/size concerns).
- The Pretendard subtitle font may not be installed -> render verification allows falling back to a system font, with the font-specification approach revisited if it fails.
- Among convenience features, this cycle's picks are: web video preview + full hand-editing. Everything else goes to the next cycle.

## Completion criteria
- [x] ffmpeg/ffprobe usable (subtitle drawtext requires `ffmpeg-full` — see render README)
- [x] Sample clips exist, seed cuesheet is valid (passes validateCueSheet)
- [x] `cuesheet-render` produces an actual mp4, resolution/duration confirmed via ffprobe (subtitles included) — 1920x1080/30fps/13s, subtitle frame confirmed
- [x] Edit -> save -> file reflects change in web; invalid values are blocked from saving with an error display — POST validation confirmed live
- [x] Web keeps auto-refreshing on external changes (bridge/direct edits)
- [x] Segment video preview plays in web
- [x] `pnpm -r typecheck && pnpm -r test` green
- [x] CLAUDE.md current state updated
