# Goal: styled .ass subtitle export

## Goal

Ship a `.ass` (SubStation Alpha) subtitle export so DaVinci Resolve imports subtitles
with the editor's actual style (font/size/color/outline/position/background) instead of
falling back to Resolve's own default look. Drive it to done.

## Scope

In:
- `@cuesheet/render`: `buildAss()` + `secondsToAssTimestamp()`, a `--ass <path>` CLI flag,
  `assPath` in the `--json` result envelope.
- `apps/web`: `GET /api/subtitles.ass` route + a "Download subtitles (.ass)" button in the
  Export step.
- Docs: render README + AGENTS.md CLI usage.

Out:
- No new subtitle-styling capabilities (only exports what the schema already expresses).
- No change to the existing `.srt` path.

## Deliverables

- PR #65 (`feat/ass-subtitle-export`), CI green, ready for the user to merge.

## Constraints (from CLAUDE.md)

- English for everything tracked in git.
- One feature per PR, branch off `main`, draft-first, squash-merge.
- Tests select by `data-testid`/ARIA role, never class name.
- Composition rule: the `.ass` button is a Button inside `ExportOutputSection`, not an
  inline accretion.

## Assumptions

- "Done" = CI green and the PR ready/mergeable. Merge itself is left to the user: it is a
  hard-to-reverse action into a protected branch, and the standing draft-first rule has the
  user review before ready. Autonomy here means driving CI to green and fixing failures, not
  merging.
- The user said it's fine for the machine's keep-awake/caffeinate to expire and let it sleep while this runs; no need to hold the machine
  awake indefinitely polling CI.

## Completion criteria

- [x] `buildAss` implemented + unit-tested (`packages/render/test/ass.test.ts`, 11 tests).
- [x] CLI `--ass` flag + `--json` `assPath` (`packages/render/test/cli.test.ts`).
- [x] Web route `GET /api/subtitles.ass` + Export button (`ExportOutputSection.test.tsx`).
- [x] `pnpm --filter @cuesheet/render test` green; `apps/web` typecheck + test green (756/756).
- [ ] CI on PR #65 green.
- [ ] PR ready for user merge.

Verify: `gh pr checks 65` reports the `build, typecheck, test` job passing.
