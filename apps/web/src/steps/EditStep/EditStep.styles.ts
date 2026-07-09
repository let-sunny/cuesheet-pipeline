import * as stylex from "@stylexjs/stylex";

/**
 * Component anatomy migration (docs/styling-migration.md) — moved here from the old
 * `App.styles.ts` App-root exception once the (2) Edit step's arrangement became its own
 * component (`steps/EditStep`), ported 1:1 from styles.css's old `.edit-layout`/`.trim-*` rules.
 */
export const styles = stylex.create({
  editLayout: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  trimLayout: {
    display: "flex",
    gap: 16,
    alignItems: "flex-start",
  },
  // Two-column workspace wrapping everything to the right of the cut list (video + field panel).
  // If the combined minimum width of the video column and field column exceeds the screen width
  // (roughly under 1280px), flex-wrap naturally drops the field column below the video.
  // Stuck to the top of the viewport via sticky, so the video+fields stay visible on screen even
  // when the cut count (tens to hundreds) makes the left cut list (.compact-list) long enough to
  // create page scroll.
  trimWorkspace: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "auto",
    minWidth: 0,
    display: "flex",
    flexWrap: "wrap",
    gap: 16,
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
  // min-width/max-width tuned (2026-07-09 QA pass) so the Range row (In 144px slot + Out 144px
  // slot + gaps + "Length X.Xs" readonly text) always fits on one line instead of landing at an
  // in-between column width that wraps only that row - see git history on `.trim-fields-col` for
  // the full measurement notes.
  //
  // Internal scroll (2026-07-09 diagnosed fix): this column can hold many groups (Range,
  // Playback, Subtitle+override, Title, Transitions, Narration, Reframe, Actions, Delete) and on
  // shorter viewports (1280x800/1440x900) the bottom groups (destructive zone) landed below the
  // fold with no way to reach them, since only the page as a whole scrolled and trimWorkspace's
  // own `position: sticky` kept re-pinning it near the top. Capping this column's own height to
  // the viewport and scrolling *inside* it (independent of the sticky video column staying put)
  // keeps the video fixed while every group stays reachable regardless of viewport height.
  trimFieldsCol: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 424,
    minWidth: 424,
    maxWidth: 440,
    maxHeight: "calc(100vh - 32px)",
    overflowY: "auto",
  },
});
