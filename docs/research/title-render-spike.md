# Title-card render spike (2026-07-09)

> Purpose: de-risk the retro/animated title-card feature (PRD backlog #2) before any UI work.
> Question: can each title preset actually be burned into the final render via ffmpeg, and at what
> cost? Experiment only -- no product code touched. All artifacts built and rendered under `/tmp`,
> cleaned up after this doc was written.

Two independent render paths were validated, because the finalized preset set (Typing, Gooey,
Particle -- cozy knitting-vlog mood) splits cleanly between them:

- **ASS/libass (`subtitles` filter)** -- works for anything expressible as vector text + libass
  override tags. Confirmed sufficient for **Typing**.
- **Headless capture -> alpha overlay** -- an HTML/SVG/canvas animation is stepped frame-by-frame
  in headless Chromium, screenshotted with a transparent background, and the resulting PNG
  sequence is composited onto the video via ffmpeg's `overlay` filter. Needed for **Gooey** and
  **Particle**, which are not expressible in ASS.

## Verdict per preset

| Preset | Path | Verdict | Evidence |
|---|---|---|---|
| Typing | ASS `\k`/`\kf` karaoke reveal + `\fad` | **Works** | Per-character Korean reveal confirmed at 3 timestamps; fade-in/out alpha ramp confirmed |
| Gooey | Headless SVG goo filter (`feGaussianBlur`+`feColorMatrix`) -> capture -> overlay | **Works** (capability proven; art direction needs iteration) | Frame sequence shows blobs converging and merging; composited correctly onto test footage |
| Particle | Headless canvas particle-convergence -> capture -> overlay | **Works cleanly** | Frame sequence shows particles condensing into fully readable text; composited correctly onto test footage |

Also tested opportunistically since they matter for general title styling, not tied to one preset:

| Capability | Verdict | Notes |
|---|---|---|
| `\pos` / `\an` position & alignment control | Works | Verified 3 anchor points (top-left, top-right, dead-center) render exactly where specified |
| Bold/outline/shadow retro look (`BorderStyle`, `Outline`, `Shadow`) | Works | Rendered correctly over a colored background |
| `subtitles` + `drawtext` in one filter graph | Works | No ordering issues, no meaningful performance cost (encode-bound, not filter-bound) |
| Neon-style alpha flicker via `\t` transforms | Works | Confirmed fully transparent -> fully opaque -> transparent flicker across 3 frames |
| RGB-split "glitch" text (chromatic aberration look) | Works, but text-layer only | 3 duplicate `Dialogue` lines (red/yellow/cyan, offset by a few px) produce a convincing fringe on the glyphs themselves. This is **not** a full-frame pixel effect -- it only ever touches the text object, never the underlying video. |
| Non-Latin (Korean) glyphs in a Latin display font (e.g. Futura) | Works via fallback | libass/fontconfig silently substitutes a CJK-capable font (Apple SD Gothic Neo on this machine) for glyphs missing from the requested font. Looks fine, but means the *actual* rendered font for Korean text depends on what's installed on the render machine, not just what's named in the style -- worth pinning an explicit CJK fallback font rather than relying on substitution. |

## What ASS cannot do (confirmed, not assumed)

- No full-frame pixel effects (VHS scan lines, chromatic aberration of the *video*, noise,
  mis-tracking bands). ASS/libass only draws vector shapes and glyphs on top of the frame; it has
  no access to the underlying pixels to distort them. Anything like that needs actual ffmpeg pixel
  filters (`rgbashift`, `noise`, etc.) applied to the video stream itself, separate from libass.
- No organic blob/gooey merging, no particle systems. These need either a pixel-shader-like effect
  (SVG filters, WebGL/canvas) or a physics-y simulation -- outside libass's vector-text model
  entirely. This is exactly why Gooey/Particle needed the second (capture-overlay) path.
- No true pixel-art font came pre-installed (`fc-list` found no "Press Start 2P"/"VT323"-style
  font on this machine). Not a blocker for the current preset trio (moot now that Retro/Pixel
  presets were dropped in favor of Typing/Gooey/Particle), but noted in case a future preset wants
  a pixel look -- would require bundling a font file with the app rather than relying on the
  render machine having one.

## Track 2: headless capture -> alpha overlay (Gooey, Particle)

### Contract

Each animation is an HTML file that:
1. Renders its first frame synchronously on load.
2. Exposes `window.seekAnimation(frameIndex)` -- given a frame index, it deterministically sets
   the DOM/canvas/SVG state for exactly that frame. No `requestAnimationFrame`, no wall-clock
   timing anywhere in the animation logic. This is what makes frame-by-frame headless capture
   reproducible: calling `seekAnimation(45)` twice, in two different browser instances, produces
   byte-for-byte the same frame.
3. Exposes `window.FRAME_COUNT` so the capture driver knows how many frames to step through.

Two working prototypes were built and verified end-to-end:

- **Gooey** (`gooey.html`): letters are represented as SVG circles under an
  `feGaussianBlur -> feColorMatrix -> feComposite` filter chain (the classic CSS/SVG "goo" trick).
  Each character's circle eases from a scattered origin point toward its final letter-spaced
  position, with per-character stagger so they arrive one after another. Note: the color-matrix
  alpha boost (`values="... 0 0 0 22 -10"`) thresholds low-opacity blobs to fully transparent --
  meaning the blob doesn't fade in smoothly, it *pops* in once its eased opacity crosses ~0.45.
  This is inherent to how the goo filter works and should be accounted for in easing curve design,
  not treated as a bug.
- **Particle** (`particle.html`): the target text is rendered once to an offscreen canvas at
  100px, and its pixel-alpha is sampled on a 6px grid to build a point cloud shaped like the text.
  One particle per point starts at a randomized (deterministically seeded) scattered origin and
  eases toward its target point with a per-particle delay, producing a convincing "particles
  assembling into text" look. This came out working cleanly on the first attempt -- verified
  fully readable Korean text ("포근한 겨울") at the final frame.

Both use a `seededRand(i, salt)` deterministic pseudo-random function (sine-based hash) instead of
`Math.random()`, so re-running the same HTML produces identical particle/blob placement every
time -- required for the cache strategy below to be sound (same input text/preset must always
produce the same frames).

### Capture pipeline

`capture.js` drives one Playwright Chromium page per animation:
1. Load the HTML file (`file://` URL), wait for `window.seekAnimation` to exist.
2. For each frame index `0..FRAME_COUNT-1`: call `seekAnimation(i)`, then
   `page.screenshot({ path, omitBackground: true })`. `omitBackground: true` is what makes the
   PNG have a real alpha channel instead of a flattened white/black background -- confirmed by
   checking the PNG's alpha channel directly (frame 0 of the particle test: 0 non-transparent
   pixels; frame 89: text fully drawn).

Measured cost (this machine, 1280x720, 90 frames = 3s @ 30fps):

| Step | Time | Per-frame |
|---|---|---|
| Gooey capture (seek + screenshot x90) | 3.26s | ~36ms/frame |
| Particle capture (seek + screenshot x90) | 3.55s | ~39ms/frame |
| ffmpeg overlay (PNG sequence) + h264 encode, onto a 3s test clip | ~0.4-0.5s | negligible vs. capture |

Screenshot time dominates; the ffmpeg overlay/composite step itself is cheap (alpha-blending a
PNG sequence onto video is far lighter than the h264 encode it's bundled with, so it doesn't show
up as a separate cost in practice).

### Composite verification

Rendered a synthetic `testsrc` clip as background, overlaid the captured PNG sequence
(`-framerate 30 -i frame_%04d.png`, `overlay=0:0:format=auto`), extracted frames at 3 timestamps
per preset. In every extracted frame the animation renders at the correct position with correct
alpha blending against the underlying video (confirmed visually: background pattern shows through
transparent regions, title art sits correctly on top at the final converged position).

### Caching: format choice matters (a real gotcha found)

Because ~3.5s/title of Playwright capture is not free, and the render pipeline may re-render a
whole project many times during iterative editing, caching the animation as a video (rather than
paying the capture cost on every render) is worth it whenever text+preset+duration repeat. Two
candidate cache formats were tested:

- **VP9 in WebM with alpha (`-pix_fmt yuva420p -c:v libvpx-vp9 -metadata:s:v:0 alpha_mode=1 -auto-alt-ref 0`)**:
  encodes without error and even reports `alpha_mode: 1` in the muxed metadata, but **on this
  machine's ffmpeg 8.1.2, decoding it back (directly, or through the `overlay` filter) silently
  drops the alpha channel** -- every decoded pixel comes back fully opaque (confirmed: decoding
  straight to RGBA PNG, 100% of alpha samples were 255). Overlaying it onto video produced a solid
  black rectangle instead of a transparent-background composite. **Do not use VP9/WebM alpha
  caching without re-verifying round-trip decode on the target machine first** -- it fails
  silently (no error, wrong visual result), which makes it a dangerous default.
- **ProRes 4444 in MOV (`-c:v prores_ks -profile:v 4444 -pix_fmt yuva444p10le`)**: alpha survives
  the full round-trip correctly (confirmed: decoded alpha channel had a real 0-255 range, not
  collapsed to a constant), and the overlay composite reproduced the same correct result as
  overlaying directly from the PNG sequence. Costs more disk (~21MB for a 3s/720p clip, vs. ~4MB
  for the equivalent PNG sequence) but is a single file instead of 90 loose PNGs.

**Recommendation: cache as a PNG sequence by default** (verified-correct, and the file-count
overhead is a non-issue since the cache is content-addressed and machine-local). Treat ProRes 4444
as an optional single-file alternative if loose-file count becomes an operational annoyance, but
re-verify its alpha round-trip if the render machine's ffmpeg build changes. Do not use VP9/WebM
alpha for this.

## Recommended render contract

`segment.title` (schema addition, not yet implemented) would look roughly like:

```
title: {
  text: string;
  preset: "typing" | "gooey" | "particle";
  start?: number;   // seconds, relative to segment start; defaults to segment start
  duration?: number; // seconds; defaults to a preset-specific standard (e.g. 3s)
}
```

At render time, `buildRenderPlan` would branch by preset:

- **`typing`**: compile `text` + `duration` into an ASS `Dialogue` line with per-character `\k`
  tags (duration split evenly, or weighted by character width) plus `\fad` for entry/exit, written
  to a temp `.ass` file, and add a `subtitles=<file>` step to that segment's existing per-clip
  filter chain (alongside the current `drawtext` step, order doesn't matter -- both were confirmed
  to coexist in one graph). No caching needed here: ASS generation and libass rendering are both
  effectively instant compared to the surrounding encode.
- **`gooey` / `particle`**: look up a content-addressed cache key --
  `hash(text, preset, duration, project.width, project.height, project.fps)` -- under something
  like `media/title-cache/<hash>/frame_%04d.png`. On a cache miss, run the headless
  capture pipeline once to populate it; on a hit, skip straight to the overlay step. Add an
  `overlay` filter step to that segment's chain, time-gated to `[start, start+duration]` within
  the segment's local timeline (via `enable='between(t,start,start+duration)'` or an input-side
  time offset) so the title only appears for its intended window.

This keeps the existing per-segment filter-chain architecture in `packages/render/src/plan.ts`
intact -- `typing` extends the existing drawtext-per-segment pattern, `gooey`/`particle` add one
more per-segment filter input (the cached overlay), no architectural change needed elsewhere in
the pipeline.

## Artifacts (for reference; not committed)

All built under `/tmp/title-spike/` (ASS snippets, rendered test mp4s, extracted verification
frames) and `/tmp/title-spike/capture/` (the two animation HTML files, `capture.js`, captured PNG
sequences, cache-format comparison files). Cleaned up after writing this doc.
