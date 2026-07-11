import * as stylex from "@stylexjs/stylex";
import {
  colorVars,
  radiusVars,
  spacingVars,
  textSizeVars,
  fontWeightVars,
} from "@astryxdesign/core/theme/tokens.stylex";

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
 *
 * `.empty` (the "can't find the source" message) is gone from styles.css (2026-07-11 stock-audit
 * completion pass) - `missing` below ports its 2 properties directly, duplicated identically in
 * IntroOutroEditor.styles.ts's own `missing` style rather than kept as a shared global class, since
 * a 2-property rule doesn't earn a shared component of its own. The scene-shot badge
 * (`scene-shot-badge`+`shot-*`) is gone too - replaced by a stock Astryx `Badge`, colored via
 * `shotTypeBadgeVariant`/`TIMELAPSE_BADGE_VARIANT` (lib/momentCards.ts), the same category-color
 * mapping the Scenes palette already uses (dedup, not a second color system).
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
    backgroundColor: colorVars["--color-background-surface"],
    borderRadius: radiusVars["--radius-element"],
  },
  videoPreviewEmpty: {
    color: colorVars["--color-text-secondary"],
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
    backgroundColor: colorVars["--color-background-blue"],
    borderStyle: "solid",
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderLeftWidth: 3,
    borderTopColor: colorVars["--color-border-blue"],
    borderRightColor: colorVars["--color-border-blue"],
    borderBottomColor: colorVars["--color-border-blue"],
    borderLeftColor: colorVars["--color-accent"],
    borderRadius: radiusVars["--radius-element"],
    fontSize: textSizeVars["--font-size-base"],
    fontWeight: fontWeightVars["--font-weight-medium"],
    lineHeight: 1.4,
    color: colorVars["--color-text-primary"],
  },
  contextSceneEmpty: {
    fontStyle: "italic",
    color: colorVars["--color-text-secondary"],
    fontWeight: fontWeightVars["--font-weight-normal"],
  },
  contextIndex: {
    fontWeight: fontWeightVars["--font-weight-bold"],
    color: colorVars["--color-text-primary"],
  },
  // Badge has no `size` prop - trims its default padding/font-size down to the compact scale this
  // inline context-header badge needs (same override as MomentPalette.styles.ts's `categoryBadge`).
  sceneBadge: {
    fontSize: textSizeVars["--font-size-xs"],
    padding: `1px ${spacingVars["--spacing-1-5"]}`,
  },
  missing: {
    color: colorVars["--color-text-secondary"],
    fontSize: textSizeVars["--font-size-sm"],
  },
  contextSceneLabel: {
    fontSize: textSizeVars["--font-size-xs"],
    fontWeight: fontWeightVars["--font-weight-bold"],
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: colorVars["--color-text-blue"],
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
    color: colorVars["--color-text-secondary"],
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
  // `backgroundColor: "black"` is a flagged literal (2026-07-11 color migration) kept as-is - a
  // true video letterbox, semantically required to stay black regardless of theme/mode, same
  // carve-out as MomentPalette's always-dark thumbnail canvas.
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
    backgroundColor: colorVars["--color-background-muted"],
    borderRadius: radiusVars["--radius-inner"],
    fontSize: textSizeVars["--font-size-sm"],
    color: colorVars["--color-text-primary"],
  },
  cropEditActions: {
    display: "flex",
    gap: spacingVars["--spacing-1-5"],
  },
  notice: {
    fontSize: textSizeVars["--font-size-sm"],
    color: colorVars["--color-text-yellow"],
  },
  noticeProxyPreparing: {
    margin: `${spacingVars["--spacing-2"]} 0`,
  },
  timeReadout: {
    fontSize: textSizeVars["--font-size-sm"],
    color: colorVars["--color-text-secondary"],
  },
  videoControlsRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: spacingVars["--spacing-1-5"],
  },
});
