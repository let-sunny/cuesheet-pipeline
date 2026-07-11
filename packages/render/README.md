# @cuesheet/render

Takes a cuesheet and renders the final video via **ffmpeg commands**. A cuesheet consumer.

## Usage

Library:

```ts
import { buildRenderPlan } from "@cuesheet/render";
import { validateCueSheet } from "@cuesheet/schema";

const cue = validateCueSheet(json);
if (cue.ok) {
  const plan = buildRenderPlan(cue.data, "out.mp4");
  // plan.args → spawn("ffmpeg", plan.args)
}
```

CLI (requires ffmpeg):

```bash
cuesheet-render project.cuesheet.json out.mp4 [--no-subtitles] [--srt <path>] [--json]
```

`--json`: on success, emits a single structured result object to stdout —
`{outputPath, durationS, srtPath}` (`durationS` is probed from the rendered file with ffprobe,
`srtPath` is `null` unless `--srt` was passed). Human-readable progress/errors always go to
stderr, `--json` or not, so stdout stays parseable by a script.

## Behavior

Each segment is trimmed (`-ss`/`-t`) → sped up (setpts/atempo) → scale/fps normalized →
subtitled (drawtext, if any), then joined with `concat`. intro/outro go before/after. bgm is
mixed in with `amix` after applying its start time (`adelay`) and volume. Output uses the
project's fps/resolution, H.264/AAC mp4.

### Segment crop (optional)

If `segment.crop` is present, that segment's filter chain applies
`crop=w=iw*{w}:h=ih*{h}:x=iw*{x}:y=ih*{y}` **right after trim, before scale** (since it's a
ratio relative to the source resolution, the `iw`/`ih` expressions make this
resolution-independent). The aspect ratio can change after crop, but the following
`scale=W:H` already stretches to the project resolution without preserving aspect ratio
(true for segments without crop too), so no separate letterbox/pad handling is needed — cropped
segments follow the same rule. If there's no `crop` field, the ffmpeg command is 100% identical
to before.

**Caution: `w !== h` distorts the picture.** When the source and project share the same aspect
ratio (16:9 in this repo), `crop.w === crop.h` keeps the crop window's aspect ratio the same as
the original, so `scale=W:H` stretches it without distortion. Making the crop window's aspect
ratio different from the original via `w !== h` means `scale=W:H` stretches it by that
(different) ratio and the image looks distorted (e.g. a narrow vertical-only crop gets
stretched vertically). `@cuesheet/schema` now enforces `w === h` (within a small epsilon) at
validation time — see that package's README — so this can no longer happen through the normal
web UI/pipeline; it only remains representable if someone edits a cuesheet by hand to bypass
validation.

`buildRenderPlan` also accepts an optional `sourceDimensions` map (`RenderPlanOptions.sourceDimensions`,
keyed by clip filename) as a precise runtime check beyond the schema-level invariant above: it
verifies each cropped segment's *actual* pixel aspect ratio (`crop.w*srcWidth /
crop.h*srcHeight`) against the project's aspect ratio, and throws a field-path style error
naming the offending cut if they deviate by more than 1%. This catches sources that turn out to
not actually share the project's aspect ratio, which the schema-level `w === h` check can't see
(it only knows the ratios, not real pixel dimensions). The CLI (`cuesheet-render`) probes each
cropped clip with ffprobe and passes the result in automatically; `buildRenderPlan` itself stays
a pure function (no ffprobe call inside it) and skips the check for any clip missing from the map.

### Per-cut subtitle style override (optional)

The **effective style** used for each segment's drawtext is a **shallow merge** of the global
`subtitleStyle` with that segment's `segment.styleOverride`: `{ ...subtitleStyle, ...styleOverride }`.
Fields absent from the override fall back to the global value; only fields present in the
override are overwritten.

- **`background` is replaced wholesale** — since the shallow merge operates per object field,
  if `background` is present in the override, the global `background`'s `color`/`opacity`/`padding`
  aren't partially mixed in; the override's object replaces it completely (a partial merge
  would create ambiguity, e.g. changing only the color while opacity stays at the global value
  — this is a deliberate design choice).
- If `styleOverride` is absent (omitted) or `null`, that segment's drawtext is **100% identical**
  to before (no regression).
- `intro`/`outro` have no `styleOverride` (a segment-only field).

### Voice-cloned narration (feature flag)

Only active when `narration.enabled === true` and the segment has a `narration` (filename). If
the `narration` field itself is absent, or `enabled: false`, the ffmpeg command is **100%
identical** to before.

- File paths are `narration.dir` + the per-segment `narration` (filename only, same philosophy
  as `clipDir`/`segment.clip`).
- Each narration audio is placed via `adelay` at **that segment's output-timeline start time**
  (cumulative across preceding segments after intro, speed-adjusted: `(out-in)/speed` summed
  over prior segments), then mixed with the existing audio (original sound + bgm) via `amix`
  after applying `narration.volume` (same pattern as bgm).
- **v1 constraint**: if the narration file is longer than that cut's length, it isn't trimmed —
  it plays on overlapping into the next cut (no automatic trimming). Also, this start-time
  calculation doesn't include intro length (intro length can't be known without probing the
  file — using an intro together with narration may shift the offset).

### Title cards (Remotion)

All four title presets (`fade`/`wordStagger`/`typing`/`highlight` - see `@cuesheet/schema`'s
`titlePresetSchema`) render through **Remotion** (`packages/render/src/remotion/`): a headless
Chrome Headless Shell (`@remotion/renderer`'s `ensureBrowser`) captures each preset's React
composition frame-by-frame into a transparent PNG sequence (`prepareTitleAssets` in `title.ts`),
which `buildRenderPlan` then overlays onto the base footage via `overlay=0:0` (a two-pass render
kicks in above a certain input count - see `twoPass.ts`). The webpack bundle
(`@remotion/bundler`'s `bundle()`) is built once per `prepareTitleAssets` call and reused across
every title in the same cuesheet - only cache misses (content-addressed by
text/preset/durationS/project dimensions) pay for it at all.

Remotion's own output filenames don't reliably match the `frame_%04d.png` contract the rest of
the pipeline depends on (its zero-padding width depends on the total frame count of that
particular render), so `prepareTitleAssets` always renders into an isolated scratch directory
first and then normalizes/renames the results into place (see `normalizeFrameFilenames`).

**Licensing note**: Remotion is free for individuals and companies up to 3 people; above that,
a commercial/company license is required (their "cloud rendering" automation tier is priced
per-render, roughly $0.01/render at the time this was adopted). Worth revisiting if this project
is ever productized/hosted for others.

## Notes

- **ffmpeg must be installed for actual encoding to happen.** If it's missing, the CLI raises a
  clear error.
- **Subtitles (drawtext) need an ffmpeg build with `libfreetype`/`fontconfig`.** macOS
  Homebrew's default `ffmpeg` formula is missing these libraries, causing a
  `No such filter: 'drawtext'` error. Install with `brew install ffmpeg-full` and make sure that
  binary comes first on `PATH` (`ffmpeg-full` is keg-only):
  ```bash
  export PATH="/opt/homebrew/opt/ffmpeg-full/bin:$PATH"
  ```
  (For cuesheets without subtitles, the default `ffmpeg` is enough.)
- Subtitle drawtext needs a font (fontconfig or `fontfile=`). It's requested by the
  subtitleStyle.font name; if the system doesn't have that font, fontconfig falls back to a
  default font (Korean still renders, but may look different from the specified font). If an
  exact font is required, switch to a fontfile path instead.
- Verified `cuesheet-render` end-to-end with real clips (`cut_01.mp4`+`cut_02.mp4`,
  `project.cuesheet.json`): a 1920x1080/30fps/13s mp4 is produced correctly, with subtitles
  confirmed in the binary frames.
- atempo only supports 0.5-2.0 → speeds outside that range are automatically decomposed into a chain.
