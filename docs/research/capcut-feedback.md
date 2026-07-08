# CapCut-family user feedback research (raw material)

> Produced by a research agent on 2026-07-07. See `editor-ux-benchmark.md` for the synthesis and conclusions.

## A. Five interactions where CapCut wins

**1. Drag-to-trim clip edge handles + auto-snap (gaps auto-close)**
- Selecting a clip shows a white box; drag either end to trim. Moving a clip auto-aligns to neighboring clips (magnetic), and gaps close automatically or via right-click. Convention is to briefly disable snapping for precise placement.
- Lets beginners adjust in/out "by eye, without typing numbers"; snapping structurally prevents mistakes (gaps, overlaps).
- Relevance to us: handle-drag + snap is the de facto standard convention for beginner UX.

**2. The three-action cut loop: "play -> Split (Ctrl+B) -> Delete -> gap closes"**
- 90% of cut editing ends up being this loop -- the substance behind the "learn it in 10 minutes" reputation. Completes entirely on the timeline, with no dialogs or mode switches.
- Relevance to us: the operation that will be most frequent in touching up an auto-generated draft is exactly this loop.

**3. The back-and-forth rhythm of timeline zoom in/out <-> playhead scrubbing**
- Constant repetition of "zoom in, scrub to just before the frame -> cut -> zoom out." Switches between precision and overview on the same screen at no cost.
- Relevance to us: if the mini timeline has a fixed zoom level, this rhythm is impossible -- whether zoom exists or not makes a big difference for finding boundaries in long takes.

**4. One-click auto subtitle generation + batch style application**
- The top reason CapCut is recommended in Korean beginner communities. Style is applied per track, so consistency comes for free.
- Relevance to us: transcription is irrelevant to us, but the expectation that "style is set once per project + a batch UI applies it across 100 cues" still applies.

**5. Direct text drag placement in preview + preset cards**
- Subtitles can be dragged directly within the preview screen to adjust position/size (WYSIWYG); styles switch instantly via thumbnail cards.
- Relevance to us: dragging subtitles over the preview is the expected convention for users. Same grammar as crop-drag editing.

Bonus: in Korean communities, the point where transcript-based editors beat CapCut is "deleting a subtitle = deleting that segment" (subtitle-cut sync) and automatic silence cleanup. The common conclusion is a division of labor: transcript-based editors for long-form/explainer content, CapCut for short-form/trend content.

## B. Three user complaints

**1. Monetization "rug pull" (the single biggest complaint across Korean and English communities)**
- Previously free features -- auto subtitles, watermark removal, fonts -- moved to Pro one by one, alongside price hikes. Reddit "rugpull" threads, a Change.org petition, a 2.4-star rating on Google Play.
- Relevance to us: local, free, and user-owned, so this entire complaint category structurally does not exist for us.

**2. Structural limits for long-form/professional work**
- Multitrack inefficiency, no audio waveform/EQ, no color scope, free tier capped at 15 minutes/720p, no media tagging. The typical narrative is "great for short-form, but people migrate to DaVinci for long-form."
- Relevance to us: our 4-6 minute main output sits between CapCut's strengths and its limits -- the combination of "simple grammar + no limits" is an open space.

**3. Notification spam/ads/paywall UX + tedium of fine subtitle adjustment**
- "Tedium of fine subtitle adjustment" is the one item among CapCut's real-editing complaints where we directly compete -- per-cue fine-tuning is the baseline set by transcript-based editors.

## C. Reasons people can't move on vs. reasons people leave

- Can't move on: the 10-minute learning curve, trend templates, mobile-desktop continuity, speed.
- Leave: monetization (#1), long-form limits (#2). Destinations: DaVinci, Filmora, Instagram Edits.

## Sources
- Zebracat/Ben Claremont/Subclip/sambaravid/Miracamp reviews and comparisons
- Descript's analysis of the CapCut workflow, capeditcut/VideoProc/Filmora timeline guides, Pexo, keyboard shortcut lists
- Riverside/Hollyland/CrePal subtitle guides
- Android Authority, vediting, Change.org, eesel roundups of alternatives
- Namuwiki CapCut entry/reviews, Korean-language comparison reviews from Dropshot Match, e-Lancer, PikaClip, and papaswith
