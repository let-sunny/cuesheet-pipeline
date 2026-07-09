# E2E smoke suite (Playwright)

A thin set of full user-journey tests against the web app's own dev server, run in a real
Chromium instance. This is a smoke suite, not exhaustive coverage — each journey is short
(well under 30s) and the whole suite is meant to stay under ~2 minutes.

This is separate from `apps/web`'s Vitest suites:

- `pnpm --filter @cuesheet/web test` — unit tests (jsdom).
- `pnpm --filter @cuesheet/web test:browser` — Vitest Browser Mode (real Chromium, opt-in per file
  via `*.browser.test.tsx`) for cases jsdom genuinely can't exercise (real layout/animation timing,
  real `<input>` focus/selection/typing).
- `pnpm e2e` (this directory) — full user journeys through the whole app, driven end to end.

## Fixture, not the real project

The suite boots its own `vite` dev server on a dedicated port (`5199`), completely separate from
port `5173` (the server a human might have open while editing their real project). It points at a
small, checked-in fixture cuesheet (`fixtures/project.cuesheet.template.json`) instead of the real
`project.cuesheet.json`, via the `CUESHEET_PATH`/`MOMENTS_PATH` env vars set in
`playwright.config.ts`'s `webServer.env`.

`global-setup.ts` runs once before the suite starts and makes every run idempotent:

1. Generates tiny fixture clips (`fixtures/generate-fixture-media.sh`, ffmpeg testsrc/sine, same
   pattern as `scripts/generate-sample-clips.sh` at the repo root) into `tests/e2e/.runtime/clips/`
   — skipped if they already exist, so repeat local runs stay fast.
2. Writes a **fresh** runtime cuesheet copy (`tests/e2e/.runtime/project.cuesheet.json`) from the
   checked-in template, with `clipDir` resolved to this run's actual absolute fixture-clips path.

`tests/e2e/.runtime/` is git-ignored — it's entirely generated, never edited by hand. If a journey
saves/renders, it mutates files under `.runtime/`, never the checked-in fixtures or the real project.

## Running

```bash
pnpm e2e        # headless
pnpm e2e:ui     # Playwright's interactive UI mode
```

Runs `workers: 1` (fully serial) deliberately — every journey shares one fixture server and one
on-disk cuesheet file that journeys mutate (subtitle edits, BGM tracks, render), so concurrent
workers would race on that shared file. The suite is small enough that this doesn't cost much
wall-clock time.

## Selector discipline

Tests select by `data-testid` or ARIA role — never by class name (see CLAUDE.md's testing
section for why, and for the one caveat: `CheckboxInput` doesn't forward `data-testid` to the DOM,
so those toggles are selected by `getByRole("checkbox", { name: "..." })` instead).

## Journeys

- `app-loads.spec.ts` — the app loads and all 3 steps (Scenes/Edit/Export) are reachable.
- `edit-subtitle-undo.spec.ts` — select a cut, edit its subtitle inline in the cut list, undo
  reverts it.
- `title-preset.spec.ts` — turning on a cut's title card shows the live preview overlay; switching
  preset keeps it showing.
- `bgm-track.spec.ts` — adding a BGM track shows a gutter bar and opens its settings panel.
- `transitions-toggle.spec.ts` — toggling "Transition in" reveals its type/duration fields.
- `export-dialog.spec.ts` — opening the export dialog shows the current (custom) resolution, and
  picking a preset updates the summary.
- `capture-frame.spec.ts` — the video preview's "Capture frame" button triggers a PNG download.
