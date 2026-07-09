import * as stylex from "@stylexjs/stylex";

/**
 * Component anatomy migration (docs/styling-migration.md, StyleX migration batch 4) — App root
 * shell + Edit step (② stage) container layout, ported 1:1 from styles.css's old
 * `.app`/`.edit-layout`/`.trim-*` rules (all owned solely by App.tsx's own render tree — not a
 * separate component, so this sits next to App.tsx without a folder, per the recipe's App-root
 * exception).
 *
 * `.app h2` is deliberately NOT here — despite the `.app`-scoped selector, it never targeted
 * anything App.tsx itself renders. It matched `<h2>` elements two levels down, inside two other,
 * already-migrated components' shared `.qf-panel-title` class (SegmentQuickFields/BgmSettingsPanel
 * panel titles). Because `.app h2` (class+tag) has higher specificity than `.qf-panel-title`
 * (class-only), it was silently winning font-size/margin on those headings and uniquely supplying
 * text-transform/letter-spacing (no other rule set those). StyleX has no descendant-selector
 * equivalent, so instead of leaving a phantom App-scoped rule around, its winning values were
 * folded directly into `.qf-panel-title` in styles.css (see the comment on that rule) — same
 * rendered result, but the rule now lives with its true owner instead of a mis-scoped ancestor.
 */
export const styles = stylex.create({
  app: {
    maxWidth: "none",
    margin: "0 auto",
    padding: "24px 32px",
  },
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
  trimFieldsCol: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 424,
    minWidth: 424,
    maxWidth: 440,
  },
});
