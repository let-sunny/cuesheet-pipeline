import * as stylex from "@stylexjs/stylex";
import { spacingVars } from "@astryxdesign/core/theme/tokens.stylex";

/**
 * Component anatomy migration (docs/styling-migration.md) — moved here from the old
 * `App.styles.ts` App-root exception once the (2) Edit step's arrangement became its own
 * component (`steps/EditStep`), ported 1:1 from styles.css's old `.edit-layout`/`.trim-*` rules.
 */
export const styles = stylex.create({
  editLayout: {
    display: "flex",
    flexDirection: "column",
    gap: spacingVars["--spacing-3"],
  },
  trimLayout: {
    display: "flex",
    gap: spacingVars["--spacing-4"],
    alignItems: "flex-start",
  },
  // Two-column workspace wrapping everything to the right of the cut list (video + field panel).
  // flexWrap stays as a safety net for viewports narrower than this app's supported baseline (see
  // docs/screen-spec.md), but at the 1280x800/1440x900 baseline viewports themselves the cut
  // list's (300px) + this workspace's two columns' widths (480 video min + 344 fields, see
  // trimVideoCol/trimFieldsCol below) are sized to fit side by side without wrapping (13-inch
  // density pass, 2026-07-10) - the field column dropping below the video was the actual bug
  // (fields effectively invisible until scrolling past the whole video block), not a fallback to
  // rely on. Stuck to the top of the viewport via sticky, so the video+fields stay visible on
  // screen even when the cut count (tens to hundreds) makes the left cut list (.compact-list)
  // long enough to create page scroll.
  trimWorkspace: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "auto",
    minWidth: 0,
    display: "flex",
    flexWrap: "wrap",
    gap: spacingVars["--spacing-4"],
    alignItems: "flex-start",
    position: "sticky",
    top: 12,
    alignSelf: "flex-start",
  },
  // Left column (wide): scene header -> video -> playback/trim controls are already bundled
  // together inside a single VideoPreview block, so this just sets that column's width.
  trimVideoCol: {
    flexGrow: 2,
    flexShrink: 1,
    flexBasis: 480,
    minWidth: 480,
  },
  // Right column (narrow, next to the video): subtitle/speed/volume/narration/crop field panel.
  // 424/440 -> a fixed 344 (13-inch density pass, 2026-07-10, docs/screen-spec.md's baseline-
  // viewport section) - this column no longer grows/shrinks at all (flexGrow/flexShrink both 0,
  // was 1/1) so its width is exactly what the Range/Playback grid tokens (144px slot x2 + 16px
  // gap = 304px, comfortably under this column's ~312px inner width after its 16px x2 padding)
  // need, and nothing more. Narrowing it (from the old 424-440 range), plus the cut list column's
  // own narrowing (CompactSegmentList.styles.ts's `list`, 480 -> 300), is what makes room for the
  // video column to sit beside both of them instead of wrapping below the video at 1280-1440px
  // total viewport width - see trimWorkspace's comment above and docs/screen-spec.md. The video
  // column keeps growing to claim any width this fixed-width column doesn't need (unchanged
  // trimVideoCol flexGrow:2 below) - the point of this narrowing is to hand width back to the
  // video, not to shrink the video itself.
  //
  // Internal scroll (2026-07-09 diagnosed fix, still needed): this column can hold many groups
  // (Range, Playback, Subtitle+override, Title, Transitions, Narration, Reframe, Actions, Delete)
  // and on shorter viewports the bottom groups (destructive zone) landed below the fold with no
  // way to reach them, since only the page as a whole scrolled and trimWorkspace's own
  // `position: sticky` kept re-pinning it near the top. Capping this column's own height to the
  // viewport and scrolling *inside* it (independent of the sticky video column staying put) keeps
  // the video fixed while every group stays reachable regardless of viewport height.
  trimFieldsCol: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 344,
    maxHeight: "calc(100vh - 32px)",
    overflowY: "auto",
  },
});
