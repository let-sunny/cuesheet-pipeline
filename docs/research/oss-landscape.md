# OSS landscape research -- publication value by component (2026-07-08)

> Purpose: classify which components of the monorepo are "useful to others." Star counts are measured
> via the GitHub API.
> A summary conclusion is in the verdict table at the bottom. Detailed comparisons are based on session
> research reports.

## Three key findings

1. **draft's (vision-based, dialogue-free rough-cut) complement position is confirmed by market size.**
   video-use, the biggest talking point in "agentic video editing" (15.9k stars, a fresh breakout hit),
   states in its own docs that "an LLM reads video, it doesn't watch it (audio is primary)" -- an
   explicit limitation. That means dialogue-free source footage (vlogs, craft/work videos) is territory
   this entire wave cannot handle. auto-editor's motion mode is the only adjacent approach, and our own
   measurements (knitting long-take scene scores of 0.09, uncorrelated with highlights) are a
   counterexample to that method. No production OSS was found for "VLM frame reading + seek-based
   coarse-to-fine + order-preserving matching."

2. **schema+render has an open seat as "editly's successor."**
   The closest prior art, editly (JSON spec -> ffmpeg, 5.4k stars), has been dormant for 14 months
   (80 open issues). OTIO is an interchange format (no rendering semantics), and commercial
   JSON-to-video APIs (json2video/Shotstack) only prove market demand. "A zod schema as contract
   (z.infer, validation errors as `field-path: reason`) + local ffmpeg rendering" is an open spot.
   That said, the category itself is a commodity, which caps the upside.

3. **bridge (MCP-based editing) is an original pattern but a minor piece on its own.**
   Existing MCP video-editing projects are either NLE remote control (davinci-resolve-mcp, 1.4k) or
   one-shot ffmpeg wrappers. There's no prior art for the document-as-contract pattern of "a validated
   JSON document as shared state, edited concurrently by AI and a human with no conflicts" -- it has
   value when presented together with schema.

## Verdict table

| Component | Attention potential | One-line positioning |
|---|---|---|
| draft | **High** | "A tool for the videos video-use can't see -- rough-cut drafting from dialogue-free source footage via VLM frame reading. Ships with measured data: 0 scene detections on long takes" |
| schema+render(+bridge) | Medium | "The spiritual successor to editly -- a zod-contract cuesheet + ffmpeg rendering + an MCP server that lets Claude Code edit it, all in one" |
| bridge alone | Medium (pattern) / Low (scale) | "Control a document via MCP, not an app" |
| schema alone | Low-Medium | Occupies space adjacent to OTIO/editly |
| web | Low | OpenCut (61.7k) already occupies the general-purpose space -- keep ours specialized to personal editing grammar |

## Reference landscape (notable projects)
Remotion 52.4k (code-as-video, commercial license) - OpenMontage 35.0k (agentic video production) -
video-use 15.9k (transcript-based agentic editing) - moviepy 14.8k - ShortGPT 7.7k - FunClip 5.9k -
editly 5.4k (dormant) - auto-editor 4.5k - OTIO 1.9k - davinci-resolve-mcp 1.4k - OpenCut 61.7k
