import * as stylex from "@stylexjs/stylex";

/**
 * Component anatomy migration (docs/styling-migration.md, StyleX migration batch 5) — rules ported
 * 1:1 from the old `.video-*`/`.crop-edit-toolbar`/`.crop-edit-actions`/`.notice`/`.time-readout`/
 * `.video-controls-row`/`.playmode-toggle` classes in styles.css (all owned solely by this
 * component; the crop-drag overlay itself lives in components/CropEditOverlay/).
 *
 * NOT migrated here (stay plain CSS, see styles.css):
 * - `.video-subtitle-overlay` (+ `.video-subtitle-overlay-bottom/top/center`, `.video-subtitle-
 *   overlay-text`) — shared with SubtitleStyleSettings.tsx/SubtitleStylePresetsSettings.tsx, which
 *   deliberately render the exact same classes for their own live-preview stages so the preview
 *   never drifts from this component's real overlay (see SubtitleStyleSettings.tsx's file
 *   comment). Not owned solely by this component.
 * - `.playmode-toggle button` (+ `.active`) — this button also carries the `.plain-button` marker
 *   class, and overrides several of its properties (padding/font-size/color, plus background/
 *   border-color on `.active`) at higher specificity (a descendant class+tag selector, class+
 *   class+tag for `.active`), same root cause as HeaderBar's theme toggle / CompactSegmentList's
 *   compact-list-actions button - StyleX can't express that specificity edge. The wrapper's own
 *   layout (`.playmode-toggle`'s flex/gap, below as `playModeToggle`) still moves to StyleX - the
 *   div keeps both the plain `playmode-toggle` className *and* the StyleX class so the descendant
 *   selectors keep matching (same hybrid pattern as CompactSegmentList's `compact-list-actions`).
 * - `.empty` (the "can't find the source" message) — shared with IntroOutroEditor.tsx (both render
 *   the same generic missing-source message). Not owned solely by this component.
 *
 * `background`/`border` shorthands are written out as their longhand equivalents - see
 * HeaderBar.styles.ts's comment for why (StyleX silently drops the shorthand form).
 */
export const styles = stylex.create({
  // Width follows the column width of the consumer (EditStep.styles.ts's trimVideoCol) as-is.
  videoPreview: {
    width: "100%",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: 12,
    backgroundColor: "var(--surface-1)",
    borderRadius: 8,
  },
  videoPreviewEmpty: {
    color: "var(--text-secondary)",
    fontSize: 13,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 120,
  },
  // Context header over the video — since "what scene am I looking at" should be the very first
  // thing seen the moment the screen appears, the scene line (contextScene) is placed above and
  // larger than the subtitle/time line.
  contextHeader: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  contextScene: {
    display: "flex",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: 6,
    padding: "8px 10px",
    backgroundColor: "var(--context-box-bg)",
    borderStyle: "solid",
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderLeftWidth: 3,
    borderTopColor: "var(--context-box-border)",
    borderRightColor: "var(--context-box-border)",
    borderBottomColor: "var(--context-box-border)",
    borderLeftColor: "var(--accent)",
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 500,
    lineHeight: 1.4,
    color: "var(--text-primary)",
  },
  contextSceneEmpty: {
    fontStyle: "italic",
    color: "var(--text-secondary)",
    fontWeight: 400,
  },
  contextIndex: {
    fontWeight: 700,
    color: "var(--text-primary)",
  },
  contextSceneLabel: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "var(--tag-blue-text)",
  },
  // Shows the full scene description text needed for judgment as much as possible — wraps as-is,
  // from one line if short to multiple lines if long, and is never truncated (no ellipsis).
  contextSceneText: {
    whiteSpace: "normal",
    wordBreak: "keep-all",
  },
  contextLine: {
    fontSize: 12,
    lineHeight: 1.4,
    color: "var(--text-tertiary)",
    paddingLeft: 2,
    // The subtitle is secondary info toned down relative to the scene — the full text needed for
    // judgment can be seen via the title tooltip.
    overflow: "hidden",
    textOverflow: "ellipsis",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    maxHeight: 32,
  },
  // `.video-crop-frame video`'s `display: block` is folded in here directly - the <video> element
  // this component renders is always inside cropFrame, so there's no case needing them split.
  video: {
    width: "100%",
    borderRadius: 4,
    backgroundColor: "black",
    display: "block",
  },
  // Preview of a cut that has a crop — the video keeps its 100% size as-is and is scaled/moved via
  // CSS transform, and this wrapper cuts it off with overflow:hidden so only the crop area is
  // visible. containerType opens a container query context, so the subtitle overlay can use cqw
  // units for a font size/outline width that's "a % of this frame's actual rendered width".
  cropFrame: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 4,
    containerType: "inline-size",
  },
  cropEditToolbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "6px 8px",
    backgroundColor: "var(--surface-2)",
    borderRadius: 4,
    fontSize: 12,
    color: "var(--text-quaternary)",
  },
  cropEditActions: {
    display: "flex",
    gap: 6,
  },
  notice: {
    fontSize: 13,
    color: "var(--warning-text)",
  },
  noticeProxyPreparing: {
    margin: "8px 0",
  },
  timeReadout: {
    fontSize: 13,
    color: "var(--text-tertiary)",
  },
  videoControlsRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
  },
  playModeToggle: {
    display: "flex",
    gap: 6,
  },
});
