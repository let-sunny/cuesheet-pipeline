# Editor UX benchmark research (transcript-based editors, CapCut, pro NLEs)

> 2026-07-07. Purpose: from user feedback on other editing tools, pick what our tool should adopt.
> Research only -- adoption to be decided after discussion with the user. See each agent report (session record) for detailed rationale and sources.

## A. Things we're already getting right (industry-validated)

1. **Subtitle = cut 1:1 structure** -- a direct implementation of the single interaction most loved in
   transcript-based editors ("delete the text and the cut is deleted"). Same structure as the killer
   feature that lets transcript-based editors beat CapCut in Korean communities.
2. **Automation presents reviewable candidates** -- the common pattern behind trusted automation
   (silence lists, filler highlights = our palette's adopt/reject badges). Distrusted automation is
   the kind where "errors are only discovered in the final video" -- putting scene descriptions +
   frame confirmation into the editing screen is the right call.
3. **Automating time-sink #1 and #2** -- the largest shares of a vlogger's editing time are
   (1) footage logging + picking cuts (1-10 hours) and (2) subtitles (5-10x the video length) --
   exactly the two things our pipeline replaces.
4. **Dialogue-free content is an industry gap** -- Gling/Descript/Premiere's text-based editing all
   assume transcripts, so "useless for content without dialogue" is a recurring caveat across reviews.
   Our vision-based approach is the only alternative position.
5. **Document-style mental model (not timeline-first)** -- "doesn't feel like a program" is the
   highest praise for transcript-based editors. Keeping our three-step structure is the right call.
6. **Ripple delete by default** -- because gaps cannot occur when a cut is deleted (concat rendering),
   we get ripple delete for free -- the thing pro NLE users rank as "the #1 way to avoid wasting your
   life" for free.
7. **Local, free, features that don't disappear** -- CapCut's rug pull, other transcript-based
   editors' paywalls, and Descript's credit complaints are each tool's #1 reason for churn. A
   structural advantage of our position.

## B. Candidates to adopt (for discussion, ordered by felt impact/effort)

| # | Candidate | Rationale | Estimated effort |
|---|---|---|---|
| 1 | **Complete the J/K/L shuttle + play-split loop** -- J reverse / K pause / L play forward (repeated taps speed up), split with Cmd+B during playback already exists | NLE convention #1-2, decisive for "finding cut points in a long take" -- exactly our 40-minute source-footage scenario | Small |
| 2 | **Direct drag of subtitles in the preview** (position/size) | CapCut's WYSIWYG convention -- "what you see is what you get, no coordinate entry." A superset of the margin slider | Medium |
| 3 | **Per-cue subtitle style overrides** (global default, per-cue exceptions only) | The #1 complaint about transcript-based editors is "can only apply in bulk." Requests for emphasized subtitles (bigger/different color) are inevitable | Medium-large (schema extension) |
| 4 | **Split/merge cut buttons** -- split (Cmd+B) exists, but merging adjacent cuts does not | A basic operation in transcript-based editors. A necessary counterpart for re-adjusting subtitle granularity | Small |
| 5 | **Mini timeline zoom** | CapCut's "precision <-> overview" back-and-forth rhythm. With 90 cuts at a fixed zoom level, fine-grained boundary work is impossible | Medium |
| 6 | **Automatic padding around cut boundaries** -- prevents cutting before an action (a knitting hand gesture) completes | A common complaint about transcript-based editors, "doesn't respect the beat/pacing"; the direction Descript officially adopted as "Avoid harsh cuts." Err wide when unsure | Small (pipeline) |
| 7 | **Final render resolution option** (1080p+ for upload) | Descript's lesson: "render quality is the last gate of trust." Current project default is 720p | Small (project.width is already adjustable -- it's a matter of exposing it in the UI) |
| 8 | Strengthen preview scrubbing (free-form seeking outside the list), snapping | CapCut convention. Currently only cut-by-cut movement | Medium |

## C. Explicitly not pursuing

- **Multitrack, effects, template marketplace** -- already excluded by the north star. This is exactly
  the opposite of CapCut's churn reason (long-form limits) and our strength, so it stays excluded.
- **Any transcript/speech-based feature** -- the source footage has no dialogue (an absolute premise
  in CLAUDE.md).
- **Automatic word-boundary alignment** -- Descript's longest-running complaint, but this structurally
  does not exist for us (subtitles are not bound to source audio). Not building it is an advantage.

## D. Discussion questions (for the user)

1. How far should we go on table B? (My recommendation: 1, 4, 6, 7 first -- low effort, high impact;
   2, 5 next; 3 after confirming real demand)
2. #7: should we raise the final upload render to 1080p? (Source is 4K so it's possible; render time
   is ~2x)
3. #6: should automatic cut boundaries default to 0.3-0.5s of padding on each side? (Cuts get slightly
   longer in exchange for not clipping actions)
