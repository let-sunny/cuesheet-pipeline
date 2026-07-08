# @cuesheet/schema

**Type + runtime validation** for the cuesheet. The contract shared by web/render.

## Usage

```ts
import { validateCueSheet, type CueSheet } from "@cuesheet/schema";

const result = validateCueSheet(jsonFromSomewhere);
if (result.ok) {
  const cue: CueSheet = result.data; // defaults (e.g. speed) applied
} else {
  console.error(result.errors); // ["segments[0].in: in must be less than out (in < out)", ...]
}
```

## Exports

- `cueSheetSchema` and other zod schemas (sub-schemas are exported individually too)
- `CueSheet`, `Segment`, `BgmCue`, `SubtitleStyle`, `Project`, `NarrationConfig` types
- `CueSheetInput` — the pre-validation input type (defaults not applied), for the web app's edit state
- `validateCueSheet(json)` → `{ ok: true, data } | { ok: false, errors: string[] }`

## Validation rules

- `segment.in < segment.out`, `segment.speed > 0`
- `segments` has at least 1 item
- `bgm.start < bgm.end`, `bgm.volume` in 0-1
- `project.fps/width/height` are positive (width/height must be integers)
- Colors are `#RGB` or `#RRGGBB` hex
- `narration.volume` in 0-1, `segment.narration` can't be an empty string (if present)
- `segment.crop.w` must equal `segment.crop.h` (within a small epsilon) — see the crop section below
- On failure, an array of `field-path: reason` messages

## Segment crop (optional)

- `segment.crop?: { x, y, w, h }` — defined as a **ratio (0-1)** relative to the source
  resolution (resolution-independent). `x,y` = top-left, `w,h` = size. `w` must equal `h`
  (within a small epsilon) — since crop.w/crop.h are ratios of the *source* frame and sources
  are assumed to share the project's aspect ratio, requiring `w === h` is exactly the
  condition under which the crop preserves that aspect ratio (see `cueSheetSchema`'s
  superRefine for the full derivation). Example: a vertical crop that cuts off the top of the
  face: `{ x: 0, y: 0.25, w: 0.75, h: 0.75 }`.
- Constraints: `x, y >= 0`, `x + w <= 1`, `y + h <= 1`, `w, h > 0.1` (lower bound to avoid
  degenerate crops), and `w === h` (within epsilon 0.005, the project-aspect invariant above).
- null/omitted means no crop (source as-is) — existing cuesheets remain valid as-is.
- For how this is applied on the render side (crop filter right after trim, before scale), see
  the `@cuesheet/render` README. `@cuesheet/render`'s `buildRenderPlan` also offers a more
  precise runtime check (`sourceDimensions`) against a clip's *actual* pixel dimensions, for
  sources that turn out not to share the project's aspect ratio after all.

## Per-cut subtitle style override (optional)

- `segment.styleOverride?: SubtitleStyleOverride | null` — a partial schema where every field
  of `subtitleStyle` (font/size/color/outlineColor/outlineWidth/position/margin/background) is
  optional. If omitted or `null`, this cut uses the global `subtitleStyle` as-is.
- Designed so the global style is the default and only exceptional cuts get a partial
  override — you don't need to restate the whole style per cut, just the fields you want to change.
- **`background` is the exception**: if specified, it replaces the global `background`
  wholesale rather than being partially merged (a partial merge would create ambiguity, e.g.
  changing only the color while opacity stays at the global value). To change the background,
  supply all of `color`/`opacity`/`padding`.
- The merge rule (which field wins in the end) is implemented by `@cuesheet/render` — see that
  package's README for details.

## Voice-cloned narration (optional, feature flag)

- `cueSheet.narration?: { enabled: boolean, dir: string, volume: number (0-1, default 1) }` —
  fully disabled if the field is absent; existing cuesheets remain valid as-is.
- `segment.narration?: string | null` — the **filename only** of the narration audio to place
  on this cut (assembled from `narration.dir` + filename, the same philosophy as
  `clipDir`/`segment.clip`). null/omitted means no narration for that cut.
- For the render-side behavior (mixed in at the segment's output start time, a v1 constraint),
  see the `@cuesheet/render` README.

## Conventions

- Time units are in **seconds**. Frame conversion is handled by render via fps.
- `segment.clip` is **filename only**; the folder is `clipDir`. → doesn't break if the folder moves.

Example: [`examples/sample.cuesheet.json`](./examples/sample.cuesheet.json)
