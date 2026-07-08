# Idea: Automatic script-to-footage matching with claude-real-video (crv)

> **Final status (2026-07-05): not adopted — review closed, installation removed.** For the
> empirical grounds, see the "Second-round measurement" / "Third-round cross-validation" sections
> below; for the difference from the alternative implementation, see the "crv vs. the in-house
> pipeline" section at the bottom. The venv (scratchpad) that was installed has been removed.
> The brew `python@3.12` package installed as a side effect of testing crv is still present
> (can be removed with `brew uninstall python@3.12` if it serves no other purpose).

## Research background

Looked into a video-analysis library that had been trending in a thread:
[claude-real-video (crv)](https://github.com/HUANGCHIHHUNGLeo/claude-real-video)
— released 2026-06-30, 810 stars within 5 days as of the research date, HN front page.
Distributed via PyPI, MIT license.

## What crv does

- From source footage (URL or local file), extracts only "frames that actually change" via
  scene-transition detection + sliding-window deduplication. Unlike fixed-interval sampling
  (e.g. 1fps), it collapses static stretches and doesn't miss fast-cut stretches.
- Everything runs locally via ffmpeg/ffprobe + Whisper. Output:
  `crv-out/frames/*.jpg` + `transcript.txt` + `MANIFEST.txt`.
- `--why "..."` lets you specify the analysis angle; `--kb <dir>` saves the results as notes.
- Can also be installed as a Claude Code skill (copied into `~/.claude/skills`) — just give it
  a link and it looks it over on its own.
- Dependencies: ffmpeg is the only requirement (no drawtext needed — unrelated to the
  [ffmpeg build issue](../../CLAUDE.md), a plain `brew install ffmpeg` suffices).

## What the actual content is like (important — a point an earlier version of this document got wrong)

The real-world source for this project is a knitting vlog. The source footage shows
hands/knitting work being filmed and has no dialogue (narration) at all — the user writes a
separate script and overlays it as on-screen subtitles, a common vlog editing approach. This is
exactly what CLAUDE.md's "based on the script, not the audio" means: the essence of matching
isn't finding the speech segment that lines up with the audio, but finding the source-footage
segment that visually matches the action/scene a given script (subtitle) line describes.

→ Conclusion: crv's Whisper transcription feature is not needed for this project. If anything
is useful, it is purely the scene-frame extraction (pulling representative frames from the
source footage that show "this is the action visible in this stretch"), and matching should
work by having Claude look at those frames and visually compare them against the subtitle
sentences. (The earlier version uncritically imported the common pattern "matching = script <->
audio transcript" — an error. The first-round smoke-test conclusion under "Status" below was
also built on that premise and needs re-evaluation.)

## If applied to this project (revised)

Two constraints that simplify the problem (confirmed by the user):
- Script order = footage time order (vlog) — this is an order-preserving sort problem, scanned
  front-to-back, not a global search/reordering problem. A global-matching design would be
  over-engineering.
- Source clips range from 3 seconds to 40 minutes, with little motion. A clip longer than 10
  minutes is usually meant either for (1) speed-up (fast-forward) use, or (2) picking out only
  a highlight segment — telling the user "this is for speed-up" / "here's where the highlight
  is" is the core value.

Flow:
1. The user prepares the script (the subtitle draft) and the source knitting footage.
2. Run crv on the source footage -> extract only scene frames (`--no-transcribe` disables the
   whisper path entirely). If motion is too small for scene detection to trigger, fall back to
   fixed-interval extraction.
3. Claude Code visually looks at the frames: for a long clip, decides "speed up the whole thing
   vs. pick a highlight" + picks candidate highlight positions (in seconds), then matches them
   against the script lines in order to generate a draft cuesheet filling in `segments`
   (clip/in/out/speed).
4. The human only needs to fine-tune the draft on the web app.

The crux is how well crv's scene detection can catch "points where the action changes" in a
single long-take recording with almost no cut transitions, as with knitting — crv was
originally designed with edited (multi-cut) footage as its premise, so detecting subtle motion
changes within a single long take has never been validated.

## Status

**The first-round smoke test was carried out on a wrong premise (script <-> audio-transcript
matching) — needs re-validation.**
Below, only the facts from that first-round test that remain reusable are kept; its conclusions
are treated as void.

- Install: `pip install --user` is blocked by PEP 668 (externally-managed), so a venv is
  required. Via venv, install succeeded in 2 seconds (`claude-real-video 0.4.0`, bundled with
  `yt-dlp`/`Pillow`). whisper is not in the default dependencies — not needed for this project
  anyway, so it doesn't need to be installed. (Use it with `--no-transcribe` explicitly turning
  that path off.)
- Run: ran both default and sensitive options against `media/clips/cut_01.mp4` (moving
  testsrc2) and `cut_02.mp4` (static smptebars, both synthetic test patterns) — cut_01 went
  12->4 frames, cut_02 went 12->1 frame. There was a signal distinguishing "static vs. changing
  screen," but this too differs in nature from real knitting footage (a single long take with
  subtle hand-motion changes) and is hard to carry over as-is.
- ~~"transcript is the core gap"~~ — discarded. This project never needed transcription in the
  first place (see above).

## Second-round measurement (2026-07-05, real source footage) — final verdict: crv not adopted

Measured against the user's real episode material (52 source clips + a finished 4:29 edit +
subtitle srt).

- Scene detection is invalid for this material: on a real 17-minute 4K knitting long take
  (fixed top-down angle, no cuts), the ffmpeg scene score peaked at 0.0903 — zero detections not
  only at the standard threshold (0.3-0.4) but even at 0.1. Lowering it to 0.05 catches 25 hits,
  but most were hand motion blur (no content change), and only 2 overlapped with actual content
  changes (unfolding the fabric at 611s, an exposure change at 989s). Since crv's core value
  (scene detection + dedup) doesn't work on this material, there is no reason to adopt crv —
  dedup would instead collapse the 17 minutes down to one or two frames.
- Fixed-interval (60-second) frames alone are also insufficient: only 1 visually identifiable
  change point in the 17 minutes. The progress of the knitting itself is almost impossible to
  tell apart via still-frame comparison.
- A usable combination of signals: (a) low-threshold (0.03-0.05) scene-score spikes as
  candidates for "an event where the hand moved significantly" (turning the work, changing
  posture, etc.), (b) exposure/brightness changes, (c) fixed-interval samples — having Claude
  Vision look at these candidate frames and pick is the realistic approach.
- The editing grammar reverse-engineered from the finished edit (the target for automation to
  imitate): 83 subtitles / 4:29 (average 2.9s), subtitle boundaries ≈ cut boundaries,
  action-description subtitles <-> sharp hand close-ups, time-elapsed <-> timer prop /
  finished-result still shots (speed-up shots are rare), cat subtitles <-> cat shots, product
  mentions <-> static object shots. In other words, what a "highlight" actually is isn't a
  scene transition but picking the moment that fits a vocabulary of shot types (hand close-up /
  object / cat / shape-change moment).
- Measured processing cost: decoding a downscaled 320px pass over the 17-minute 4K clip for
  scene scoring takes about 6 minutes (2.8x speed). For a 40-minute source clip, about 14
  minutes — manageable as a batch job; pre-generating a proxy (a low-resolution copy) is
  reasonable.
- Operational caveat: the source folder has many iCloud-evicted files (a blocks=0 placeholder
  hangs indefinitely on read). The pipeline must check local-file presence with `stat -f %b`
  before processing.

## Third-round cross-validation (2026-07-05, second episode "dotmix-best") — scene detection fully ruled out, confirmed

Repeating the same analysis on a second episode (52 source clips, a finished 5:29 edit + 100
subtitle cues) found:

- Scene-detection invalidity reproduced: on a 28-minute-41-second 4K long take, scene score
  peaked at 0.0914 (nearly identical to lowkey's 0.0903), zero detections at or above 0.1. All
  6 top-scoring points were hand motion blur.
- A more decisive finding: visual inspection of 60-second-interval frames identified 5
  highlight candidates (cat appears ~600s, a drink can appears ~900s, posture change ~1140s, a
  change in the knitted piece's shape ~1380s, a finishing motion ~1680s) — and these points
  don't even clear a scene-score threshold of 0.02. In other words, the points with the highest
  scene scores and the actual highlights are completely uncorrelated — this also discards the
  hypothesis raised in lowkey that "low-threshold motion spikes can be used as a candidate
  signal." Vision (visual inspection of frames) is the primary signal, and the only one that
  works.
- Cost-structure finding: the full-decode scene pass takes 9.7 minutes for a 29-minute clip
  (now removed, since it's no longer needed). By contrast, seek-based frame extraction (`-ss`
  placed before `-i`) takes seconds — candidate extraction is effectively free.
- Confirmed generalization of the editing grammar: average 2.953s per subtitle (essentially
  identical to lowkey's 2.944s), 89.8% coverage (lowkey: 90.6%), one subtitle line = one cut
  correspondence at 30/30, the same cat / reveal / chapter-transition gap patterns. Newly
  observed: PIP comparison inserts, outdoor B-roll (a button shop), a 1-hour srt timecode
  offset (starts at 01:00:00, needs correcting when parsed), 0/30 motion-blur cuts — speed-up
  cuts are very rare in finished edits.
- The dotmix source footage also has many iCloud-evicted files (39/52). The srt downloaded
  immediately via `brctl download` (the bridge daemon works fine for small files — only large
  files are a real blocker).

- Next action (revision 3 — design finalized): reflecting the user's decision (video-first:
  build the rough cut/draft edit first, subtitles later) plus the cross-validation results.
  Without crv, without scene detection:
  1. Seek-based fixed-interval frame extraction per clip (60-second coarse pass) — detect
     blocks=0 placeholders beforehand.
  2. Claude Vision scans the frames to find change points, then re-samples only the changed
     stretches more densely to narrow down the position (coarse-to-fine binary search).
  3. Classify shot type (sharp hand close-up / static object / cat / shape-change or reveal
     moment), then generate a draft cuesheet with `segments`, in time order, matching the
     user's editing rhythm (average cut 2.9s, finished length 4:30-5:30, coverage ~90%). Put a
     note of "what's visible on screen" into the `subtitle` field so the user can rewrite it
     on the web app.
  4. Scoring: measure overlap between the draft and the two episodes' answer keys (actual
     subtitle timing/cuts). Bridge expansion comes after that.

## crv vs. the in-house pipeline — what's actually different (for the record)

Both started from the same idea ("extract frames and have Claude look at them"), but after
empirical measurement they turned into entirely different things.

| | crv | In-house (proto-draft pipeline) |
|---|---|---|
| Purpose | General-purpose "video understanding/summarization" assistant (extracts frames + transcript) | **Rough-cut/draft generation** — via a cuesheet (JSON) contract, all the way to an actual mp4 render |
| Frame selection | Scene-transition detection + deduplication. **Assumes edited multi-cut footage** | Seek-based fixed interval + coarse-to-fine narrowing changed stretches down to 1-2s. **Assumes a cutless long take** |
| Performance on this material | Scene score maxes out at 0.09 -> zero detections; dedup collapses a long take down to one or two frames | Validated by measurement on two episodes — 82% of the prototype's cuts matched or resembled the user's actual edit |
| Audio | Whisper transcription is a core feature | Not used (source footage has no dialogue) |
| Judgment | Only extracts frames; judgment is left to the user | Claude Vision classifies and selects using **the user's editing grammar** (reverse-engineered from real edits: average cut 2.9s, a shot vocabulary — hand close-up / object / cat / reveal / wearing), and even assembles the speed-up rhythm |
| Quality loop | None | Note-frame self-verification + scoring against real-edit answer keys (match/similar/recall rate) |
| Dependencies | Python venv, yt-dlp, (optional) whisper | ffmpeg + the existing TS monorepo — zero added dependencies |

One-line summary: crv is a general-purpose tool that "lets you skim through a video," while
ours is a specialized pipeline that "generates a rough cut by imitating this specific user's
editing." crv's core assumptions (that scene transitions exist, that there is speech) both fail
to hold for this project's material, as confirmed by measurement — hence, not adopted.
