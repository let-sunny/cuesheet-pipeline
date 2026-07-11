import type { CueSheet, Segment, Title } from "@cuesheet/schema";

/** Matches the schema's title.durationS default (3) - the value shown right after the toggle is turned on, before onChangeTitle's first patch lands. */
export const DEFAULT_TITLE_DURATION_S = 3;

/** Default text a title card starts with when the toggle is turned on (2026-07-09 QA-2 fix) - a
 * blank string left the preview showing nothing at all until the user typed something, which read
 * as "did this even turn on?"; "Title" is schema-valid (any string) and visibly confirms the
 * toggle worked, same as Title's other fields (Typing preset, 3s) already default to something. */
export const DEFAULT_TITLE_TEXT = "Title";

/**
 * "Title card for this cut" toggle - turning it on starts from a sane default (typing, 3s, no
 * dim) so the preview shows something immediately, same pattern as the subtitle style override
 * toggle. Turning it off removes the `title` key entirely.
 */
export function toggleSegmentTitleAt(cue: CueSheet, i: number, enabled: boolean): CueSheet {
  const segments = cue.segments.map((s, idx) =>
    idx === i
      ? enabled
        ? { ...s, title: { text: DEFAULT_TITLE_TEXT, preset: "typing" as const, durationS: DEFAULT_TITLE_DURATION_S } }
        : withoutTitle(s)
      : s,
  );
  return { ...cue, segments };
}

/** Patches segment i's title (a no-op when the segment has no title). */
export function updateSegmentTitleAt(cue: CueSheet, i: number, patch: Partial<Title>): CueSheet {
  const segments = cue.segments.map((s, idx) => (idx === i && s.title ? { ...s, title: { ...s.title, ...patch } } : s));
  return { ...cue, segments };
}

// Same convention as subtitleStyleOverrideEditing's withoutStyleOverride: drop the `title` key
// entirely (rather than leaving it null) when a cut's title card is turned off.
function withoutTitle(segment: Segment): Segment {
  const { title: _title, ...rest } = segment;
  return rest;
}
