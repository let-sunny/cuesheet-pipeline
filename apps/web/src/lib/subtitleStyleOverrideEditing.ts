import type { CueSheet, Segment, SubtitleStyle, SubtitleStyleOverride } from "@cuesheet/schema";

/**
 * "Style for this cut only" toggle - turning it on starts the override as a straight copy of the
 * global subtitleStyle (so the visible value doesn't change the instant it's toggled), letting the
 * user adjust values from there. Turning it off (= clearing the override) removes the
 * styleOverride key.
 */
export function toggleSegmentStyleOverrideAt(cue: CueSheet, i: number, enabled: boolean): CueSheet {
  const segments = cue.segments.map((s, idx) =>
    idx === i ? (enabled ? { ...s, styleOverride: { ...cue.subtitleStyle } } : withoutStyleOverride(s)) : s,
  );
  return { ...cue, segments };
}

/** Patches segment i's styleOverride (merging onto its existing override, or {} if it has none). */
export function updateSegmentStyleOverrideAt(cue: CueSheet, i: number, patch: Partial<SubtitleStyleOverride>): CueSheet {
  const segments = cue.segments.map((s, idx) =>
    idx === i ? { ...s, styleOverride: { ...(s.styleOverride ?? {}), ...patch } } : s,
  );
  return { ...cue, segments };
}

/** Removes segment i's styleOverride entirely. */
export function clearSegmentStyleOverrideAt(cue: CueSheet, i: number): CueSheet {
  const segments = cue.segments.map((s, idx) => (idx === i ? withoutStyleOverride(s) : s));
  return { ...cue, segments };
}

/**
 * "Promote to global style" - merges segment i's override into the global subtitleStyle and
 * removes segment i's override. Returns null when segment i has no override (nothing to promote).
 */
export function promoteSegmentStyleOverrideAt(cue: CueSheet, i: number): CueSheet | null {
  const target = cue.segments[i];
  if (!target?.styleOverride) {
    return null;
  }
  const mergedGlobal: SubtitleStyle = { ...cue.subtitleStyle, ...target.styleOverride };
  const segments = cue.segments.map((s, idx) => (idx === i ? withoutStyleOverride(s) : s));
  return { ...cue, subtitleStyle: mergedGlobal, segments };
}

/** Sets (or clears, via null) segment i's named subtitle style preset. */
export function changeSegmentStylePresetAt(cue: CueSheet, i: number, presetName: string | null): CueSheet {
  const segments = cue.segments.map((s, idx) => (idx === i ? { ...s, stylePreset: presetName } : s));
  return { ...cue, segments };
}

// When clearing an override, drop the styleOverride key entirely (don't leave the value as null) —
// null is also schema-valid as "no override" (nullable), but this standardizes on omission
// (undefined) to avoid leaving an unnecessary "styleOverride": null in the saved file.
function withoutStyleOverride(segment: Segment): Segment {
  const { styleOverride: _styleOverride, ...rest } = segment;
  return rest;
}
