# Goal: a render-trigger button in the web UI

## Goal

From the `@cuesheet/web` editor, trigger a render (mp4 output) directly from the saved cuesheet.
Right now the `cuesheet-render` CLI has to be run separately in a terminal — this removes that manual step.

## Scope

Included:
- Add `POST /api/render` to the server (Vite middleware): read the current cuesheet file on disk ->
  `validateCueSheet` -> `@cuesheet/render`'s `buildRenderPlan` -> spawn `ffmpeg` to actually render.
  Add `@cuesheet/render` as a dependency to reuse it (no reimplementing the logic).
- Output goes to `out.mp4` at the repo root. Add a static-serving route so it's downloadable once done.
- Show in-progress/success/failure status in the UI. On failure, show the last part of ffmpeg's stderr.
- If dirty (unsaved), disable the render button + prompt to save first.
- Guard against overlapping concurrent render requests with a server-side in-progress flag, nothing more
  (no over-engineering — no queuing, etc.).

Excluded:
- Progress (%) streaming, render cancellation, render history/managing multiple outputs — next cycle.
- The app installing/managing ffmpeg itself — spawn whatever ffmpeg is on PATH as-is (same assumption as the CLI).

## Constraints (CLAUDE.md)

- time unit is seconds, clip paths are filename-only (assembled via `clipDir`), types derived from zod, no emojis.
- validation messages keep the `field path: reason` format (same convention as the existing save API).

## Assumptions

- Render targets what's already saved to the cuesheet file (on disk) — the client's draft is not
  re-sent (same source as the save API, enforcing a strict "save, then render" order).
- Render is synchronous (the HTTP response waits for ffmpeg to finish) — fast enough for local test
  clips (a few to a few dozen seconds). Handling large/long renders is a candidate for the next cycle.
- Cuesheets with subtitles require `ffmpeg-full` (drawtext support) on PATH — already
  reflected in `~/.zshrc`. No separate ffmpeg-binary discovery/fallback logic is built into the app code (out of scope).

## Deliverables

- `packages/web/src/cuesheet-plugin.ts`: `POST /api/render`, output download route.
- `packages/web/src/api.ts`: `renderCueSheet()` client function.
- `packages/web/src/App.tsx` (or a new component): render button + status UI.
- `packages/web/package.json`: add `@cuesheet/render` dependency.
- CLAUDE.md current state updated.

## Completion criteria

- [x] `pnpm -r typecheck && pnpm -r test` green (`pnpm install` is blocked by the supply-chain lockfile
      policy, so confirmed by running `tsc`/`vitest` directly per package — web tsc, render tsc+vitest
      8 tests passed)
- [x] Render button is blocked or prompts to save while dirty (button disabled + banner prompt)
- [x] Requesting a render on a saved cuesheet produces an actual `out.mp4` (ffprobe: confirmed
      1920x1080/30fps/13s)
- [x] Output is reachable via the download route (`GET /out.mp4`, byte count matches)
- [x] With a deliberately broken cuesheet, the failure case surfaces an error in the UI (validation
      failure 400 / ffmpeg failure 500, both unified as `{ok:false, error:string}` so the client
      displays it as-is)
- [x] Confirmed via real runtime (dev server up + curl) — success/failure/concurrent-request 409/download
      all confirmed live

## Assumption updates (encountered during actual implementation)

- In this environment, `pnpm install` is blocked outright by `baseline-browser-mapping@2.10.42`'s
  supply-chain minimumReleaseAge policy (a pre-existing issue, not caused by this work).
  The builder manually created a `packages/web/node_modules/@cuesheet/render` symlink, and
  the orchestrator manually added a `@cuesheet/render` workspace-link entry to the `packages/web`
  importer in `pnpm-lock.yaml` (same pattern as the schema entry). Once the policy cutoff has
  passed and `pnpm install` works again, it's recommended to run it properly once to confirm the
  result matches this manual edit.
- In the initial implementation, the response body shapes for cuesheet validation failure (400) and
  ffmpeg failure (500) differed from each other (`{errors: string[]}` vs `{error: string}`) — the client's
  `RenderResult` type only declared the latter, so there was an edge case where `undefined` showed up
  for the former (a rare case where the saved file gets deleted/corrupted externally between
  requests). The orchestrator resolved this by unifying the server's 400 response as
  `{ok:false, error:string}` too — matching the type to the actual response with no client code
  changes.
