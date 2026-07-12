# @cuesheet/draft

Automatically generates a **rough-cut cuesheet** from a raw footage folder. The core of this
project — the deterministic half of "throw in a raw footage folder, get a rough cut out." The
vision judgment of picking which moments to use by looking at frames is **Claude(Claude Code)'s
job**, not a human's — this package only handles what comes before and after that (scan, assemble).

## Flow

```
1. scan       raw footage folder -> inventory + frame extraction -> manifest.json
2. (Claude)   reads the frames in manifest.json directly with Read -> writes moments.json (vision judgment)
3. assemble   moments.json -> apply assembly rules -> cuesheet (JSON), validated with validateCueSheet then saved
```

Once the cuesheet exists, hand-edit it with `@cuesheet/web` and render with `@cuesheet/render`.

## Usage

```bash
cuesheet-draft scan <source-folder> --out <work-folder>
# -> <work-folder>/manifest.json, <work-folder>/frames/<clip-name>/*.jpg

# (in between, Claude looks at frames/ and writes moments.json)

cuesheet-draft assemble \
  --manifest <work-folder>/manifest.json \
  --moments <work-folder>/moments.json \
  --clip-dir <source-folder> \
  --project-name "<project name>" \
  --out <cuesheet-path>.json \
  [--fps 30] [--width 1280] [--height 720] [--boundary-pad 0.4] [--config <path.json>] [--domain <dir>] [--json]
```

`--json` (both subcommands): emits a single structured result object to stdout on success
(scan: `{clips, evicted, frames, manifestPath}`; assemble:
`{segments, durationS, connectors, validationOk, outPath}`) — human-readable progress/errors
always go to stderr, `--json` or not, so stdout stays parseable by a script.

Also usable as a library:

```ts
import { scanFolder, assembleDraft } from "@cuesheet/draft";
import { validateCueSheet } from "@cuesheet/schema";

const manifest = await scanFolder(srcDir, workDir);
// ... after writing moments
const cueInput = assembleDraft(moments, { clipDir, projectName });
const result = validateCueSheet(cueInput); // assembleDraft itself doesn't validate
```

## manifest.json (scan's output)

```json
{
  "clips": [
    {
      "name": "VID_0001.mp4",
      "durS": 57.6,
      "interval": 5,
      "frames": [{ "t": 0, "path": "/work/frames/VID_0001/t00000.jpg" }]
    }
  ],
  "evicted": ["VID_0002.mp4"]
}
```

- Video file matching (`.mp4`/`.mov`) is case-insensitive on the extension (`.MP4`/`.MOV` are
  included too) — real raw-footage folders mix in uppercase-extension clips, and they must not
  be missed.
- `evicted`: iCloud not-downloaded (placeholder) files. `blocks===0` means there's no local
  file (reading it hangs indefinitely waiting for the download), so these are skipped.
  Non-deterministic values like `scannedAt` are deliberately not included (same input -> same
  manifest).
- Frame interval scales with clip length: 2s under 15s, 5s under 60s, 15s under 300s, 60s
  above that. Even long takes extract quickly since it's seek-based (`-ss` before `-i`) —
  though a 60-second interval alone may not pin down a moment's precise in-point, so once
  Claude finds a change region, it's recommended to pull additional frames at a tighter
  interval within just that region to nail it down (a separate manual step — scan only does
  the uniform-interval first pass).

## moments.json (Claude's vision-judgment output)

```json
[
  {
    "clip": "VID_0001.mp4",
    "clipSummary": "Scene of hands working with a ball of yarn",
    "moments": [
      {
        "inS": 0,
        "outS": 3,
        "shotType": "hand-closeup",
        "memo": "Hand touching the ball of yarn",
        "quality": 4
      }
    ],
    "monotonousRanges": [
      { "startS": 10, "endS": 55, "desc": "Continuing to knit by hand", "faceExposed": false }
    ]
  }
]
```

- `shotType`: an open string at the engine level; the vocabulary is domain data
  (`domains/<name>/shot-types.json`). Knitting's: `hand-closeup` / `object` / `cat` / `change` /
  `reveal` / `wearing` / `other`. With `assemble --domain <dir>`, out-of-vocabulary values are rejected.
  (a shot vocabulary drawn from the user's actual editing grammar).
- `quality`: 1-5. Only 3 and above is accepted as a steady-speed highlight.
- `monotonousRanges`: stretches with no change, just continued work. Timelapse-connector candidates.
- `monotonousRanges[].faceExposed`: whether this range carries face-exposure risk (exposure
  beyond the chin) — vision judges are **strongly encouraged to always specify this
  explicitly**. If omitted, assemble conservatively falls back to checking whether the `desc`
  text contains both a face-part word and the risk word (ambiguous cases lean toward "risky").
- Validated against the zod schema `momentsFileSchema` exported by `@cuesheet/draft`. On
  failure, prints `field-path: reason` and exits with code 1.

## Assembly rules (assembleDraft)

- Segments are ordered **by clip filename (= shooting time order) -> ascending in-point within
  a clip**. Never reordered.
- Steady highlights: only `quality >= 3` is accepted, with `speed=1`, `volume=1`,
  `subtitle=memo`. **Boundary padding**: once accepted, `in = max(0, inS - PAD)` and
  `out = min(clipDur, outS + PAD)` are applied first (`PAD` defaults to 0.4s, adjustable/disableable
  via `assembleDraft({ boundaryPadS })` or the CLI's `--boundary-pad`). This is slack to keep a
  motion (a knitting hand gesture) from being cut off before it completes (see the "doesn't
  respect breathing room" complaint pattern in transcript-based editors and Descript's 'Avoid
  harsh cuts' reference). `clipDur`
  comes from manifest.json's `durS` (wired automatically by the CLI); clips without an entry
  skip the upper-bound clamp. If padding causes adjacent cuts within the same clip to overlap,
  half of the overlap is rolled back from each side so they no longer overlap. Individual
  lengths run 2-3.5s — if the padded length exceeds 3.5s, **both ends are trimmed
  symmetrically** (keeping the motion centered) to clamp it to 3.5s. If the overall steady-cut
  average exceeds 3.1s, a single greedy pass trims 0.25s at a time, symmetrically from both
  ends, off the longest cut until the average converges to 2.8-3.0s (based on the user's
  measured rhythm, averaging 2.95s; timelapse connectors are left untouched). All of the above
  (quality threshold, cut-rhythm targets, timelapse-connector rules, face-heuristic word lists,
  boundary pad) are grouped into an `AssembleGrammarConfig` that can be overridden via
  `assembleDraft({ config })` or the CLI's `--config <path.json>` — the defaults are exactly
  these values (the user's grammar), so omitting it reproduces this behavior unchanged.
- Timelapse connector: for stretches of 30s or more within a clip's `monotonousRanges`, inserts
  a 30-60s slice (anything over 60s is cut off) at `speed=14` (the midpoint of the 12-16 speed
  range) — output length is always between 2.1 and 4.3 seconds (slice length / 14).
  `subtitle="(timelapse) <desc>"`. Capped at 8 per episode (to prevent overuse).
  **Face-exposure-risk ranges (`faceExposed: true`, or judged risky by the desc heuristic) are
  never chosen as connectors** — if a clip has no safe monotonous range, no connector is added
  for that clip and it's silently skipped (only a one-line console log is left).
- `intro`/`outro` are fixed to `null`, `bgm` is an empty array — both are filled in by hand
  later.
- The result is returned pre-validation (`CueSheetInput`). `assembleDraft` itself is a pure
  function; validation (`validateCueSheet`) is the caller's job — the CLI prints
  `field-path: reason` on validation failure and exits with code 1.

## Notes

- ffprobe/ffmpeg must be on `PATH` (the default ffmpeg is enough for the subtitle-free scan
  step; for the later render step's subtitles, see `@cuesheet/render`'s README — `ffmpeg-full`
  is required).
- scan only processes local files (`blocks>0`). Reading an iCloud not-yet-downloaded file hangs
  indefinitely until the download finishes, so these must always be filtered out first.
