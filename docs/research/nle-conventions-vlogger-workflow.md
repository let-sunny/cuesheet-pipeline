# Pro NLE conventions + vlogger workflow research (raw material)

> Produced by a research agent on 2026-07-07. See `editor-ux-benchmark.md` for the synthesis and conclusions.

## A. Top 7 standard pro-NLE conventions (ranked by mention frequency in beginner tutorials/reviews)

| # | Convention | Description | Why it's loved |
|---|---|---|---|
| 1 | Space play/pause | The absolute basic play toggle | Common to every NLE -- second nature with nothing to learn |
| 2 | J/K/L shuttle | J reverse, K pause, L play forward, repeated taps speed up | "The DNA of an editor's muscle memory." Overwhelmingly faster than mouse scrubbing for finding cut points while scanning long footage (shuttle tools reported to save 10-30% of time). Decisive for reviewing long takes |
| 3 | I/O in/out marking + three-point editing | Mark a range in the source -> insert into timeline | The moment beginners learn this, they shift from "drop a clip and trim it" to "pull only the parts you need and assemble them" |
| 4 | Ripple delete | Downstream clips auto-pull-in on delete | "Not knowing this wastes your life deleting gaps" -- the most-mentioned tip in tutorials |
| 5 | Blade/cut at playhead (Cmd+K/B) | Instant split at the current playback position | The core of the "play-pause-cut" rhythm |
| 6 | Snap toggle (S/N) | Magnetic alignment of boundaries/playhead | Guarantees frame-precise alignment; a single-key toggle keeps the rhythm from breaking |
| 7 | Timeline zoom (+/-, Shift+Z) | Zoom in for fine trims <-> zoom back out to the full view | The back-and-forth between "micro work" and "overall structure" is the basic cycle of editing |

Secondary: keyboard-only workflows are claimed to be ~20% faster; in practice most pros use a hybrid (left hand on the shuttle, right hand on the mouse). DaVinci even ships built-in Premiere/FCP7 keymap presets, that's how industry-standard this is.

## B. Top 3 vlogger time sinks

1. **Footage logging + picking cuts (selects)** -- logging takes 1-10 hours, rough cut 2-5 hours. Industry
   average is 45-60 minutes of total editing per finished minute; a 5-minute vlog runs to about 4 hours.
2. **Subtitles/captions** -- manual captioning takes 5-10x the video length, plus 1-2 more hours just for
   manual timecode assignment. The heavier the subtitle format (83-100 cues), the more this cost dominates.
3. **Music, effects, transitions + color/sound finishing** -- transitions take 3-8 hours, color/mixing
   2-6 hours. That said, many note that this share is lower for everyday vlogs.

## C. Three trust boundaries found in AI auto-editing

1. **"Dialogue-based rough cuts" have won trust, but only for content with dialogue.** Gling: "90% of
   cleanup automated, 60-minute source -> rough cut within 5 minutes," with many reviews reporting
   2-3 hours saved per video. The recurring caveat: "useless outside dialogue-centric content" --
   **this entire category is inapplicable to dialogue-free content.**
2. **Highlight "selection" diverges from human judgment.** Opus Clip: "the AI's definition of a
   highlight doesn't match mine," clips starting/ending at awkward points. Consensus: delegate the
   initial extraction, but leave final selection and boundary adjustment to a human.
3. **Framing/visual automation is "a tool you use while watching it."** Premiere Auto Reframe: one-click
   when it works, but reports of "losing the subject and drifting toward a wall." Pattern: **accepting
   automated output as a default and manually correcting only the failure points is acceptable; fully
   automatic with no review is not trusted.**

## Sources
Filmsupply keyboard shortcuts, No Film School on J/K/L, Apple FCP/Adobe on three-point editing, Storyblocks
on ripple delete, Evercast Resolve cheat sheet, PremiumBeat on keyboard-only workflows, Gling/TastyEdits/Veedyou
on editing time, 3PlayMedia on captioning, Submagic/Fritz/ImpactPlus Opus Clip reviews, rmupdate's Gling review,
Frame.io on text-based editing, StreamingMedia/Adobe community on Auto Reframe.
(Note: could not obtain direct Reddit quotes -- figures are based on aggregates from editing agencies/tool
vendors and creator citations.)
