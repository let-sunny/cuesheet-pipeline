---
description: Review a raw footage folder, plan the episode's story flow with the wiki, then hand off to /episode
argument-hint: <raw footage folder path under 브이로그_소스, or none to list candidates>
---

Given a raw footage folder already organized into event-subfolders (see the personal
wiki's `raw-footage-sorting` page), do two things a mechanical pipeline can't do on its
own - review the footage with the user and plan the episode's story flow with them -
then hand off to `/episode` for the mechanical scan/vision/assemble pass. This command
owns the judgment-call parts; `/episode` owns the pipeline.

**The personal wiki is a sibling repo, not part of this one.** Its path is
`../seonhee-wiki` relative to this repo's parent (i.e. a directory next to
`cuesheet-pipeline`) - request access to it if this session doesn't have it yet. It
holds the *current criteria* this command needs (persona, shooting-plan structure,
raw-footage-sorting convention) and is where new criteria/preferences discovered
during this command get written back. **Never hardcode a criterion here that the wiki
already owns** - query it instead (see "Querying the wiki" below), so this file stays
correct even after the wiki's answer changes.

Input: `$ARGUMENTS` = a raw folder path under `브이로그_소스` (e.g.
`"02_가을뜨개 (09.23~11.07) 빨강스웨터·브라운숄"`). If omitted, list the folders directly
under `브이로그_소스` (per the wiki's top-level naming convention, each folder name
already summarizes what's in it) and ask the user which one.

## Querying the wiki

Whenever this command needs a criterion (persona tone, the shooting-plan's slot
structure, an episode's known garments, etc.), follow the wiki's own **query
procedure** (its `CLAUDE.md`): read the relevant wiki page(s), answer using what's
there with the source page named, and say plainly if the wiki has no answer yet rather
than guessing. Don't paraphrase a criterion into this file from memory - read the
current page each time this command runs, since the wiki changes.

## Step A - Raw footage review

The event-subfolders inside the target folder already have first-pass labels (per
`raw-footage-sorting`'s methodology: time-gap clustering, frame-sampled best guess).
Before planning anything, walk through the ones that need a human:

1. List every event-subfolder. Flag any labeled `미확인_...` or `확인필요_...`, and
   spot-check a few confidently-labeled ones for sanity (a wrong guess can look
   confident).
2. For each flagged folder, sample 1-3 representative frames (seek-based ffmpeg grab
   for video, direct read for photos - same as `raw-footage-sorting` describes) and
   show them to the user.
3. **Ask about ONE folder at a time, not a batch.** Wait for the answer before moving
   to the next - this mirrors how the first full sort of this channel's footage
   actually went, and batching questions makes them harder to answer from a single
   frame.
4. Apply each answer immediately: rename the folder (label only - never the files
   inside), or move it to a different top-level folder if the user says it belongs to
   a different project/season (per `raw-footage-sorting`'s "same 대분류 -> merge into
   that folder's sequence, don't make a new top-level folder" rule). Update that
   folder's `_event-split-manifest.md` to record the correction, same pattern as past
   corrections.
5. If an answer reveals an entirely new, previously-unknown project mixed into this
   folder, split it out as its own top-level folder per `raw-footage-sorting`'s naming
   convention, and ask the user what to call it before finalizing the folder name.

## Step B - Episode story-flow plan (paper edit)

Once the folder's content is understood (not necessarily every single event resolved -
only the ones that matter for deciding structure):

1. Read `shooting-plan` from the wiki for the current slot structure (greet / premise /
   project beats / promise+closing, as of whenever this runs - don't assume it's still
   exactly 4 slots, re-read it).
2. List the event-subfolders in chronological order with their labels - this is the
   material. Draft which beats this episode will actually use: which project(s) get a
   full beat, which events are B-roll/곁가지, roughly how the episode opens and closes
   (per `opening-closing`'s guaranteed-teaser convention).
3. Present the draft plan to the user in plain language (not a cuesheet, not JSON) and
   get their confirmation or changes before continuing. This is a direction call, so
   it's a check-first point per CLAUDE.md's autonomy principle, not an autonomous one.
4. Save the confirmed plan as `media/drafts/<slug>/paper-edit.md` (same file
   `/episode`'s own step (2.6) paper-edit looks for/produces - if this command already
   wrote one, (2.6) should refine it from the now-reviewed moments.json rather than
   starting over).

## Step C - Hand off to /episode

Run `/episode` on this folder as normal (scan -> vision judgment -> its own paper-edit
refinement -> assemble -> subtitle voice pass -> face crop proposal -> report). Nothing
about `/episode` itself changes - this command just means it starts from
already-reviewed footage and an already-confirmed story plan instead of a blank slate.

## Step D - Editing / subtitles

Continue per the wiki's `editing-flow` page (FCPXML/SRT export, DaVinci Resolve import,
final cut/subtitle polish) - that page is the live source of truth for this step, don't
duplicate its procedure here.

## Recording new criteria/preferences back to the wiki

Anything discovered during Steps A/B that's a standing preference or fact (not just
this one episode's content) - a correction to how a project should be named, a new
rule about what counts as a project beat, a persona detail that came up while
discussing the footage - goes back into the **wiki**, never into this repo's own docs.
Follow the wiki's `ingest` procedure: summarize, propose which wiki page(s) to touch,
get confirmation, then write (raw/ source + the relevant wiki page), same as every
other wiki update this session has done. Purely episode-specific content (which clip
is which, this episode's specific beat list) stays in `media/drafts/.../paper-edit.md`
and `_event-split-manifest.md` - not the wiki, which explicitly isn't an episode log.
