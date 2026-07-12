# Doc surfaces: what's guarded, generated, or prose-only

Docs drift from code and quietly mislead agents (the motivating incident: USER-GUIDE named
title presets that no longer existed, and a narration UI that isn't mounted). The rule, per
issue #34: **classify each doc surface, and machine-guard its *mechanical facts* only — commands,
flags, enum values, tool names, env vars — never sentence prose.** Prose in a guarded file is
free to change; only the code-ish tokens are pinned to source.

| Surface | Class | Guard |
|---|---|---|
| `AGENTS.md` | **guarded (executed)** | `check-agents-doc.mjs` runs the documented CLIs and cross-checks the tool table, env vars, and flags against source |
| `docs/USER-GUIDE.md` | **guarded-mechanical** | `check-user-guide-presets.mjs` (title presets vs `titlePresetSchema`) + `check-doc-facts.mjs` (`pnpm` scripts exist) |
| `docs/FIRST-EPISODE.md` | **guarded-mechanical** | `check-doc-facts.mjs` (`pnpm` scripts exist) |
| `README.md` | **guarded-mechanical** | `check-doc-facts.mjs` (`pnpm` scripts exist) |
| `CLAUDE.md` Astryx catalog block | **generated** | `pnpm exec astryx agent-docs` regenerates the block; re-run after any `@astryxdesign/*` bump |
| `CLAUDE.md` "Current status" | **prose-only** | the living status is `docs/STATUS.md`; treat this section as a narrative snapshot, not a guarded contract |
| `docs/STATUS.md` | **prose-only** | living status narrative |
| `packages/*/README.md` | **prose-only** | package-level prose; promote a fact here to guarded-mechanical if it starts drifting |
| `domains/<name>/` theme files (shot-types/grammar/face-policy) | **guarded-mechanical** | `packages/draft/test/domain.test.ts` no-drift pins the knitting bundle to the engine defaults it was lifted from |
| `docs/voice-guide.md` | **prose-only (corpus data)** | Korean voice corpus/examples — data, not a claim about code (see `check-language.mjs`'s exception) |

## Guards, and how to extend them

- `scripts/checks/check-agents-doc.mjs` — the strongest guard: it *executes* AGENTS.md's documented
  surface. Anchors on code tokens (fenced `cuesheet-draft`/`cuesheet-render` commands, tool-table
  rows, backtick env vars), so rewording prose never trips it.
- `scripts/checks/check-user-guide-presets.mjs` — pins USER-GUIDE's title-preset list to the schema
  enum. The first instance of a narrow "guarded-mechanical" pin.
- `scripts/checks/check-doc-facts.mjs` — the generalized pin: every `pnpm <script>` a human-facing
  doc names must be a real root `package.json` script (or a pnpm builtin). Add a surface by listing
  its file in that check's registry.

To pin a new mechanical fact, prefer extending an existing check's registry over hand-writing a
new one; keep the pure matcher in `scripts/checks/lib/` with unit tests (per the testability rule).
