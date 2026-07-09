# Token usage report

`scripts/token-usage-report.mjs` measures how many tokens this project's own
Claude Code workflows have actually burned, by parsing the session log files
Claude Code already keeps on disk -- no network calls, no extra dependencies.

## Usage

```bash
pnpm token-usage                                   # full report, human-readable tables
pnpm token-usage --session <sessionId>              # restrict to one top-level session (+ its subagents)
pnpm token-usage --since 2026-07-08                 # only lines timestamped on/after this date
pnpm token-usage --json                             # machine-readable dump instead of tables
pnpm token-usage --dir <path>                       # override the log directory (defaults below)
```

By default the log directory is derived from this repo's absolute path:
`~/.claude/projects/<repo-path-with-/-replaced-by-->`. On this machine that's
`~/.claude/projects/-Users-minseon-Code-cuesheet-pipeline/`.

## What it reads

- Top-level session transcripts: `<logDir>/<sessionId>.jsonl`
- Every subagent transcript nested under `<logDir>/<sessionId>/`, matched
  recursively as `agent-*.jsonl` at any depth. This also picks up background
  Workflow forks under `.../subagents/workflows/wf_.../agent-*.jsonl`, not
  just directly-launched Task/Agent-tool subagents.
- The sibling `agent-*.meta.json` next to each subagent transcript, which
  carries `agentType`/`description`/`spawnDepth` when the harness recorded
  them (background workflow forks typically only have `agentType`).

## Format quirks this script accounts for

1. **Duplicate usage lines per message.** A single logical assistant message
   (one `message.id`) is split across multiple JSONL lines, one per content
   block (`thinking` / `tool_use` / `text`), and every line repeats the same
   `usage` snapshot for that message. Summing every line would double- or
   triple-count tokens. Fix: dedupe by `message.id` within each file, count
   usage once per id.
2. **`usage.iterations`.** Some entries (observed on backgrounded/"bg"
   sessions) report all-zero top-level `input_tokens`/`output_tokens`/
   `cache_*_tokens` and instead stash the real numbers in `usage.iterations[]`.
   Fix: prefer `iterations` when present and sum across them; otherwise use
   the top-level fields directly.
3. **Subagent coverage depends on the transcript actually being persisted.**
   A `Task`/`Agent` launch notification in the parent transcript only carries
   `resolvedModel` and a `description`, never `usage` -- the only place a
   subagent's real token usage lives is its own `agent-*.jsonl`. This script
   found those files reliably under `<sessionId>/subagents/...` for every
   session in this project as of this writing, but if your harness/version
   only writes a subagent's transcript to a transient path (e.g. under
   `/private/tmp/...`) and doesn't copy it back, that agent's usage will be
   invisible here.

## Workflow tagging

Tags are assigned by best-effort keyword/tool-name matching against each
transcript's own prompt text (plus `description` from its meta file) and the
tool names it invoked:

| Tag | Trigger |
| --- | --- |
| `episode-draft-pipeline` | mentions `/episode`, `scanFolder`, `assembleDraft`, `manifest.json`, or "초벌" |
| `vision-judgment` | mentions "vision", "moments.json", "quality >=", or "비전 판단" |
| `bridge-edit` | called an `mcp__cuesheet-bridge__*` tool |
| `goal-orchestration` | mentions `/goal` or `docs/goals` |
| `render-e2e` | mentions `buildRenderPlan`, `cuesheet-render`, or `ffmpeg` |
| `unclassified` | none of the above matched -- reported honestly, not guessed |

A single run can match more than one tag (e.g. a builder agent that both
implements the render pipeline and touches the bridge), so the workflow-tag
table's totals will not sum to the same grand total as the by-model table --
that's expected, not a bug.

## Cost estimate

Cost is estimated from a small built-in price map (USD per 1M tokens),
keyed by a coarse "tier" guessed from the model name (`sonnet`/`opus`/
`haiku`, matched by substring):

- These are Anthropic's published API list prices as of when this script was
  written. **Prices may be stale** -- check
  <https://www.anthropic.com/pricing> before relying on this for real
  budget decisions.
- `claude-fable-5` is not a published/priced model in this dataset. Its cost
  is estimated using Opus-tier pricing as a labeled placeholder, since it
  appears to be this environment's top-tier/escalation model -- treat that
  number as an order-of-magnitude guess, not a real bill.
- `<synthetic>` messages (e.g. auto-generated compaction summaries) are
  costed at $0.
- Cache-write and cache-read tokens are priced at roughly 1.25x and 0.1x the
  base input price respectively, matching Anthropic's standard cache pricing
  ratios -- not pulled per-model from an official cache price table.

## Known measured totals for this project (as of 2026-07-09)

Across all 7 sessions logged for this repo and their 538 subagent/workflow-
fork transcripts (14,665 deduped assistant messages, ~77 malformed lines
skipped in this run -- these are truncated/interrupted physical lines from
whichever session is *currently active* while the report runs, e.g. this very
script's own invocation being logged in real time as it executes. Malformed-
line count is therefore not a fixed number and will vary slightly run to run;
it does not indicate a bug in older, closed sessions):

- input: 398,260 / output: 2,482,754 / cache-write: 69,247,081 /
  cache-read: 2,386,440,852 tokens
- by model: `claude-fable-5` ~1.50B tokens total, `claude-sonnet-5` ~1.62B,
  `claude-haiku-4-5-20251001` ~19.6M, `claude-opus-4-8` ~58K
- estimated cost: **~$2,292** (dominated by cache-read volume; see caveats
  above, especially the `claude-fable-5` pricing placeholder)

Re-run `pnpm token-usage` for current numbers -- this project is under active
autonomous development and these totals grow every session.
