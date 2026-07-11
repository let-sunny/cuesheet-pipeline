import * as stylex from "@stylexjs/stylex";
import { radiusVars, spacingVars, textSizeVars, fontWeightVars } from "@astryxdesign/core/theme/tokens.stylex";

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
 * - `.empty` (the "can't find the source" message) — shared with IntroOutroEditor.tsx (both render
 *   the same generic missing-source message). Not owned solely by this component.
 *
 * `background`/`border` shorthands are written out as their longhand equivalents - see
 * HeaderBar.styles.ts's comment for why (StyleX silently drops the shorthand form).
 *
 * Spacing/radius migration (2026-07-11, design-principles.md #5 strict rule, same reasoning as
 * MomentPalette.styles.ts's comment): `gap`/`padding`/`margin`/`borderRadius` read from Astryx's
 * `spacingVars`/`radiusVars`, snapped to the nearest step. Structural sizing (`minHeight: 120`,
 * `maxHeight: 32`'s 2-line clamp cap) and font-size stay literal/deferred, same reasoning as before.
 */
export const styles = stylex.create({
  // Width follows the column width of the consumer (EditStep.styles.ts's trimVideoCol) as-is.
  videoPreview: {
    width: "100%",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: spacingVars["--spacing-2"],
    padding: spacingVars["--spacing-3"],
    backgroundColor: "var(--surface-1)",
    borderRadius: radiusVars["--radius-element"],
  },
  videoPreviewEmpty: {
    color: "var(--text-secondary)",
    fontSize: textSizeVars["--font-size-sm"],
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
    gap: spacingVars["--spacing-1"],
  },
  contextScene: {
    display: "flex",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: spacingVars["--spacing-1-5"],
    padding: `${spacingVars["--spacing-2"]} ${spacingVars["--spacing-2"]}`,
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
    borderRadius: radiusVars["--radius-element"],
    fontSize: textSizeVars["--font-size-base"],
    fontWeight: fontWeightVars["--font-weight-medium"],
    lineHeight: 1.4,
    color: "var(--text-primary)",
  },
  contextSceneEmpty: {
    fontStyle: "italic",
    color: "var(--text-secondary)",
    fontWeight: fontWeightVars["--font-weight-normal"],
  },
  contextIndex: {
    fontWeight: fontWeightVars["--font-weight-bold"],
    color: "var(--text-primary)",
  },
  contextSceneLabel: {
    fontSize: textSizeVars["--font-size-xs"],
    fontWeight: fontWeightVars["--font-weight-bold"],
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
    fontSize: textSizeVars["--font-size-sm"],
    lineHeight: 1.4,
    color: "var(--text-tertiary)",
    paddingLeft: spacingVars["--spacing-0-5"],
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
    borderRadius: radiusVars["--radius-inner"],
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
    borderRadius: radiusVars["--radius-inner"],
    containerType: "inline-size",
  },
  cropEditToolbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacingVars["--spacing-2"],
    padding: `${spacingVars["--spacing-1-5"]} ${spacingVars["--spacing-2"]}`,
    backgroundColor: "var(--surface-2)",
    borderRadius: radiusVars["--radius-inner"],
    fontSize: textSizeVars["--font-size-sm"],
    color: "var(--text-quaternary)",
  },
  cropEditActions: {
    display: "flex",
    gap: spacingVars["--spacing-1-5"],
  },
  notice: {
    fontSize: textSizeVars["--font-size-sm"],
    color: "var(--warning-text)",
  },
  noticeProxyPreparing: {
    margin: `${spacingVars["--spacing-2"]} 0`,
  },
  timeReadout: {
    fontSize: textSizeVars["--font-size-sm"],
    color: "var(--text-tertiary)",
  },
  videoControlsRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: spacingVars["--spacing-1-5"],
  },
});
