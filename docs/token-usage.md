# Token usage report

`scripts/token-usage-report.mjs` measures how many tokens this project's own
Claude Code workflows have actually burned, by parsing the session log files
Claude Code already keeps on disk -- no network calls, no extra dependencies.

## Headline: what does producing one episode cost?

The question that matters day to day is not "what did this project cost to build" but
"what does the next episode cost to produce." Those are very different numbers -- most
of this project's lifetime tokens went into building and debugging the tool itself, not
into running it. This section isolates a single, complete, end-to-end production run and
reports that in isolation. The lifetime development total is further down, clearly
labeled as a development cost, not a production cost.

### Measured: the v4 full-cycle run (2026-07-07)

The v4 run is the first complete pass through the finished, official pipeline: scan
(51 local clips) -> per-clip vision judgment (parallel Sonnet subagents) -> assemble ->
subtitle voice pass -> director QC (contact-sheet review) + face-crop fixes -> final
render (subtitled + clean + SRT). Isolated by wall-clock window (scan launch to the
wrap-up commit, see "Method" below), not by re-running anything.

| Stage | Model(s) | Cost | Recurs every episode? |
|---|---|---:|---|
| Vision judgment (51 clips, parallel subagents) | Sonnet | $8.38 | Yes -- scales with clip count |
| Subtitle voice pass | Sonnet | $0.79 | Yes |
| Director QC + face-crop fix (successful pass) | Sonnet | $9.37 | Yes |
| Director QC (contact-sheet review) + render verification + coordination | orchestrator (claude-fable-5) | $39.16 | Yes -- largest single cost, dominated by image review |
| Director QC + face-crop fix, wasted rate-limited attempt | Sonnet | $5.70 | No -- artifact of hitting a session limit mid-task, not inherent to the workflow |
| Assemble pipeline fix (face-exposure guard on timelapse connectors) | Sonnet | $0.33 | No -- one-time code fix, now permanent in `@cuesheet/draft` |
| Grading against a known-answer cuesheet (v3-vs-v4 recall check) | Haiku | $0.07 | No -- only meaningful while validating against a hand-edited reference; a brand-new episode has no answer key |
| **Full run, all-in (as actually measured)** | mixed | **$63.81** | -- |
| **Marginal cost going forward** (excludes the three "No" rows above) | mixed | **~$57.70** | -- |

Total tokens across the run: 4,675 input / 71,709 output / 2,160,550 cache-write /
78,105,836 cache-read (~84M tokens total). Cache-read dominates, same pattern as the
lifetime total below -- large image/context reads get re-sent across many tool-call
turns within a single agent.

**Cross-check**: vision judgment averaged ~$0.164/clip across the 51 clips (roughly
14 input + 107 output + 25,566 cache-write + 222,647 cache-read tokens per clip-agent).
51 x $0.164 ~= $8.38, matching the stage total -- consistent with per-clip parallel
agents doing comparable work rather than one agent doing wildly more than another.

### Why "marginal" differs from "full run"

This was the *first* complete run of the finished CLI pipeline, so it carries one-time
costs a steady-state episode won't: a code fix to close a pipeline hole found during
review (now permanent), a validation-only grading pass against a hand-edited reference
episode (no answer key exists for a genuinely new episode), and a wasted subagent
invocation that died mid-task on a session-limit reset and had to restart from scratch
("이전 에이전트가 한도로 죽어 재발사 -- 처음부터 진행해라" in the restart prompt -- confirmed
from the transcript, not assumed). Subtracting those three leaves ~$57.70 as the better
estimate of what the *next* episode costs, assuming similar clip count and no rate-limit
interruptions.

The single largest line item, by a wide margin, is the orchestrator's own director-QC
pass (reviewing contact-sheet images cut by cut) plus render verification and
coordination -- not the parallel vision-judgment subagents. Image-heavy review by the
top-tier model is the expensive part of this pipeline, not the bulk per-clip scanning.

### Method: isolating a single production run

There is no built-in "production run" flag in the logs, so the window was reconstructed
from evidence, not assumed from a rough time-of-day guess:

- The user's own messages bracket the run: "나 출근해야해서 나머지 너가 다 알아서 해두고"
  (leaving for work, 2026-07-06T23:28:15Z / 08:28 KST) kicks off an autonomous wakeup
  loop, and a later wakeup ("경계 모드 (풀 사이클 완료...)", 2026-07-07T02:49:00Z / 11:49 KST)
  confirms the cycle was already complete and idle.
- The precise start is the backgrounded scan command itself: `cuesheet-draft scan
  media/dotmix_src -> media/drafts/dotmix_v4`, launched 2026-07-06T23:27:56Z (08:27:56 KST),
  described in-transcript as "51클립" (51 clips) -- which is also why the vision-judgment
  stage below has exactly 51 per-clip subagents, not an assumed/rounded 52.
  Scan and assemble are themselves deterministic CLI runs (no LLM calls), so they
  contribute ~$0 in direct token cost; their cost only shows up as the orchestrator's
  (small) coordination overhead.
- The precise end is corroborated by git commit timestamps in the same window: the
  wrap-up commit `docs: summarize the v4 full cycle (80.0% recall, 3.00s rhythm, dual
  face guard) + add v4 SRT` lands at 2026-07-07 10:48:08 +0900 (2026-07-07T01:48:08Z),
  right before the run's last subagent activity finishes.
- Every subagent transcript and every top-level-session message with a timestamp inside
  `[2026-07-06T23:27:56Z, 2026-07-07T02:00:00Z]` (padded slightly past the last commit;
  confirmed no further subagents launch in the padding) was attributed to a pipeline
  stage by reading its prompt/description text and, for the two director-QC/face-crop
  attempts, the actual transcript content (to tell a genuine restart-from-scratch apart
  from a resume). No other, unrelated work was interleaved in this window -- the prior
  hours (05:00-08:28 KST) were UI feature work and touch-ups on an earlier cuesheet, not
  part of the v4 run, and were excluded.

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

## Lifetime development total (context only -- this is NOT a production cost)

This is the cumulative cost of *building* the whole project so far -- every feature,
every bug fix, every research detour, every backlog item, on top of every actual
production run. It answers "what has this project cost to develop," not "what does one
episode cost." For the latter, see the headline section above.

### Known measured totals for this project (as of 2026-07-09)

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
