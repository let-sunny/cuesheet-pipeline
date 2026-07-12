# Knitting domain — vision judgment rules

The judgment rules a vision subagent applies when reading a knitting-vlog clip's frames to write
its `ClipMoments`. This is the knitting *theme*; the engine (scan, assemble, schema) is
domain-agnostic. Voice/tone is a separate personal layer (generated from transcripts), not here.

## Shot vocabulary

Each moment's `shotType` is one of the ids in `shot-types.json`:
`hand-closeup` (hands working the knit), `object` (yarn/tools/finished piece, still), `cat`
(the cat appears), `change` (posture/setup/scene change), `reveal` (showing a finished or
in-progress piece to camera), `wearing` (trying the piece on), `other`.

## Face policy (absolute rule)

Faces may be exposed only up to the chin (anything above that, including the lips, is a
violation). The same standard applies to the user as well as to other people such as family. If
a moment has a violating frame, tag its `memo` with `[얼굴노출]` and lower quality to 1 so it's
deprioritized for adoption (not excluded entirely — it can still be salvaged with a vertical
crop in the editor, so it must stay in the palette). Always set
`monotonousRanges[].faceExposed` explicitly.

## Long takes (clips 300s or longer), coarse-to-fine

First sweep at 60-second intervals to find ranges with visible change, then recursively narrow
those ranges down to 1-2 second intervals. Don't scrutinize the whole thing densely (wasteful) —
ranges with no change are only recorded in `monotonousRanges` (candidates for a timelapse
connector, each with its `faceExposed` flag).

## Ordering

Script order = footage time order (a vlog property). Treat matching as order-preserving search,
not global rearrangement.
