---
description: Auto-generate a rough cut (cuesheet) from a single raw footage folder - full v4 pipeline instructions
argument-hint: <raw footage folder path>
---

Given a single raw footage folder for a new episode, run the whole thing through -
from scan to rough-cut cuesheet. The entity running this command (the current
session) owns the orchestration - no separate model escalation, just continue in
this same session, except (2) vision judgment, which is delegated per-clip to
parallel sonnet subagents. Don't block on questions; follow the autonomy principle
in CLAUDE.md.

Input: `$ARGUMENTS` = raw footage folder path (absolute or relative).

## Forbidden

- **Never auto-run render.** This command's scope ends at producing the rough-cut
  cuesheet - the user has to review/edit it in the editor and press the render
  button themselves.
- **Never modify the raw footage folder.** Treat it as read-only (check `blocks`
  via `stat -f %b` before reading, so you don't accidentally trigger a download of
  an iCloud placeholder).

## Procedure

### (1) Scan

```bash
pnpm episode "$ARGUMENTS" --scan-only
```

If `media/drafts/<slug>/manifest.json` already exists, the script automatically
skips the scan (idempotent). To rescan, rerun with `--rescan`.
From the output, confirm the slug (a filesystem-safe name derived from the folder
name) and the local/not-downloaded clip counts, and lock in the
`media/drafts/<slug>/manifest.json` path and the `episodes/<slug>.cuesheet.json`
target path you'll use in later steps.

### (2) Vision judgment (moments.json)

For each clip in `manifest.json`, spin up **parallel subagents** (model: sonnet)
to look at the frames and write `media/drafts/<slug>/moments.json`. Each subagent
judges based only on its own clip's `frames` list (path + timestamp), and returns
a single `ClipMoments` object matching the schema below. Once all are back, merge
them into an array and write it to the file.

**Schema** (must match the zod definitions in `packages/draft/src/types.ts`):

```ts
type ShotType = "hand-closeup" | "object" | "cat" | "change" | "reveal" | "wearing" | "other";

interface Moment {
  inS: number;
  outS: number;
  shotType: ShotType;
  memo: string;       // screen description (written in Korean - becomes the basis for the subtitle draft)
  quality: number;     // 1-5, only 3+ gets adopted into the rough cut
}

interface MonotonousRange {
  startS: number;
  endS: number;
  desc: string;
  faceExposed: boolean; // required - whether this range (a candidate for a timelapse connector) risks face exposure
}

interface ClipMoments {
  clip: string;               // must match the clip name in manifest.json
  clipSummary: string;
  moments: Moment[];
  monotonousRanges: MonotonousRange[];
}
```

**Always** specify `monotonousRanges[].faceExposed` explicitly (if omitted,
assemble falls back to a desc-text heuristic, which is a safety net that can be
inaccurate, not the default path).

**Judgment rules**:

- **Face policy (absolute rule)**: faces may be exposed only up to the chin
  (anything above that, including the lips, is a violation). The same standard
  applies to the user as well as to other people such as family. If a moment has
  a violating frame, tag its `memo` with `[얼굴노출]` and lower quality to 1 so it's
  deprioritized for adoption (not excluded entirely - it can still be salvaged
  with a vertical crop in the editor, so it must stay in the palette).
- **Long takes (clips 300s or longer), coarse-to-fine**: first sweep at 60-second
  intervals to find ranges with visible change, then recursively narrow those
  ranges down to 1-2 second intervals. Don't scrutinize the whole thing densely
  (that's wasteful) - ranges with no change are only recorded in
  `monotonousRanges`.
- **iCloud not-downloaded clips**: clips in manifest.json's `evicted` list have no
  frames, so skip them (never trigger a download).
- **Seeks always put `-ss` before `-i`** (already done at the scan stage for these
  frames, so not applicable here - this rule only applies if you need to extract
  additional frames).
- Script order = footage time order (a property of vlogs) - keep the premise that
  this is order-preserving search, not global rearrangement matching.

### (2.5) Frogging narrative pass (only when there's a long take)

Long takes of 5+ minutes lose the "mistake/frogging" narrative if judged frame by
frame - the moment the knitted piece **shrinks** as it's being worked on is only
visible by comparing adjacent frame pairs (v4 measurement: successfully bracketed
the ground-truth frogging point, zero false positives in the control group).

1. Generate a pair schedule: call `buildPairSchedule(manifest)` from
   `@cuesheet/draft` via `node -e` -> a list of adjacent frame pairs per clip.
2. For each pair, compare the two frames by reading them (no need for parallel
   subagents - this is on the order of dozens of pairs):
   record `{clip, tA, tB, verdict: grew|shrank|same|unclear, confidence 1-5, note}`
   into `media/drafts/<slug>/progress.json` (zod: `progressFileSchema`).
   shrank = stitch count decreased / came off the needle / reverted back to a ball
   of yarn.
3. Run `extractNarrativeEvents(judgments)` to extract events -> **add
   mistake_discovered points to moments.json as quality-5 moments** (state
   "frogging discovered" explicitly in desc - the mistake narrative is a key story
   beat in the user's editing grammar), and add resumed points as quality 4.
   Refine the timestamp by re-checking frames near the event's atS (since the grid
   is +-60s, re-extract at 15-second intervals in just that range if needed).

### (3) Assemble

First confirm the build is current (if you touched draft source code just before
this, dist may be stale - this has happened before):

```bash
pnpm --filter @cuesheet/draft build
```

Then assemble:

```bash
node packages/draft/dist/cli.js assemble \
  --manifest media/drafts/<slug>/manifest.json \
  --moments media/drafts/<slug>/moments.json \
  --clip-dir "$ARGUMENTS" \
  --project-name "<slug>" \
  --width 1920 --height 1080 --fps 30 \
  --out episodes/<slug>.cuesheet.json
```

Use the default for `--boundary-pad` (0.4s). Internally, assemble adopts
quality>=3, converges on cut rhythm (average 2.8-3.0s), applies timelapse
connectors on monotonous ranges (speed 14, 30-60s slices, max 8 per episode,
automatically excluding ranges with face-exposure risk), and finishes with
`validateCueSheet` before saving. If it fails, the CLI prints the cause to stderr
in `field-path: reason` format and exits 1 - fix moments.json and retry.

### (4) Subtitle voice pass

Read `docs/voice-guide.md` in full and follow its rules to rewrite
`segments[].subtitle` in `episodes/<slug>.cuesheet.json` (right after assemble,
`memo` is carried over as-is, so it reads as a screen description, not subtitle
copy). Principles:

- **Always base it on memo (the screen content)** - don't copy-paste corpus
  sentences verbatim (borrow only the voice/tone).
- Target around 25 characters (matches the 3-second cut rhythm), no line breaks,
  no emoji.
- Cats must always be written as "고앵이".
- Completion/reveal cuts get a "짜잔"-style line, the episode's final cut gets an
  "안녕~~"-style goodbye.

### (5) Face crop proposal

If a moment tagged `[얼굴노출]` was adopted, or a timelapse connector's source
`desc` carries face-exposure risk, propose a vertical crop for that segment.
**Lock the aspect ratio (crop width == height, square or an equivalently narrow
ratio)** and set the crop coordinates so only the area below the chin line
remains, then re-check the frame at that timestamp to verify the area above the
chin still isn't exposed after cropping. This is a proposal that can be turned off
anytime in the editor, so err on the aggressive side - missing one is worse.

### (6) Verify + server handoff

- `episodes/<slug>.cuesheet.json` already passed `validateCueSheet` in step (3).
  If you directly edited subtitles/crops in (4)/(5), re-check before saving
  (directly editing JSON can drift from the schema). Command to check:

  ```bash
  node --input-type=module -e "
  import { validateCueSheet } from './packages/schema/dist/index.js';
  import { readFileSync } from 'node:fs';
  const data = JSON.parse(readFileSync('episodes/<slug>.cuesheet.json', 'utf-8'));
  console.log(JSON.stringify(validateCueSheet(data)));
  "
  ```

- **Note**: since (1) scanned with `--scan-only`, `scripts/episode.mjs`'s
  port-check/server-start/browser-open logic (checking 5173 and either notifying
  or starting it) **never ran during this execution** - `--scan-only` skips that
  whole block and returns early. In other words, the script won't tell you whether
  a web server for this episode is up, so check yourself:

  ```bash
  curl -s http://localhost:5173/api/cuesheet | grep -m1 '"name"'
  ```

  If the response's `project.name` differs from `<slug>` (this episode's project
  name) - meaning the server is up for a different episode - tell the user a
  restart is needed (don't automatically kill and restart it yourself - the user
  may be working on something else). The exact command to tell them:

  ```bash
  CUESHEET_PATH=$(pwd)/episodes/<slug>.cuesheet.json pnpm --filter @cuesheet/web dev
  ```

  If nothing is up on port 5173 (curl fails), just start it fresh with the command
  above.

### (7) Report

Keep it short and fact-based:

- Cut count / total duration (seconds and mm:ss)
- Number of face-exposure cases handled (crop proposals / quality downgrades)
- Number of timelapse connectors inserted
- Editor URL (`http://localhost:5173`) - only valid immediately if (6) found the
  server already up for this episode. If it was up for a different episode,
  include the restart command from (6) in the report instead of the URL (the user
  must run that command before this episode shows up).
- Next step: "browse and refine by playing through the full cut in the editor"
  (this command only takes you through the rough cut)

## Notes

- Time unit is seconds, clip paths are filenames only (`segment.clip`) - see the
  core conventions in CLAUDE.md.
- Ground-truth baseline (Lowkey/Dotmix): average 2.9-3s per subtitle, one subtitle
  line = one cut, timelapse cuts are rare.
- Past run numbers and verification history accumulate in `docs/STATUS.md` -
  if this run is a milestone, add it there too, but whether to commit is a call
  made after user approval (this command itself never commits).
