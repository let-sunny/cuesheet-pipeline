# Knitting domain — narrative (frogging) judgment rules

The rules a subagent applies when comparing adjacent frame pairs of a long take to detect the
mistake/frogging narrative. This is the knitting *theme*; the pair-comparison mechanism
(`buildPairSchedule`, `extractNarrativeEvents`) is domain-agnostic and reads these rules from
`narrative.json`. A genre with no such narrative simply omits `narrative.json` and skips this pass.

## When this pass runs

Only for long takes — clips of `minDurS` seconds or longer (300s = 5 minutes for knitting). Short
clips don't have time for the narrative to unfold. `buildPairSchedule(manifest, minDurS)` already
filters to these.

## Verdict vocabulary

For each adjacent frame pair, judge one `verdict` from `narrative.json`'s `verdicts`:
`grew` (the knitted piece got bigger — more rows/stitches), `shrank` (it got smaller — stitch
count decreased, came off the needle, reverted back to a ball of yarn = a frogging signal),
`same` (no meaningful change), `unclear` (can't tell). Record
`{clip, tA, tB, verdict, confidence 1-5, note}` — the note in the current working language.

## Events (the transition table)

`extractNarrativeEvents` tracks the last valid state (the most recent significant verdict —
`grew`/`shrank` — skipping `same`/`unclear` and anything below `minConfidence` = 3), then fires:
- **mistake_discovered** — the state was not shrank (was `grew`, or nothing yet) and becomes
  `shrank`. The frogging is discovered.
- **resumed** — the state was `shrank` and returns to `grew`. Knitting resumes.

## Promotion to moments

Promote each event to a moments.json moment at the quality in `narrative.json`'s `qualityBoosts`:
`mistake_discovered` -> quality 5 (state "frogging discovered" explicitly in the memo — the mistake
narrative is a key story beat in the user's editing grammar), `resumed` -> quality 4. Refine the
event timestamp by re-checking frames near its `atS` (the sweep grid is +-60s, so re-extract at
15-second intervals in just that range if a tighter `in` point is needed).
