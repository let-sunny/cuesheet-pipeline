import * as stylex from "@stylexjs/stylex";
import { colorVars, radiusVars, spacingVars, textSizeVars } from "@astryxdesign/core/theme/tokens.stylex";

/**
 * Horizontal property-bar styling for the BGM track editor (2026-07-12): the panel moved from the
 * right-hand Cut-settings column to a full-width bar at the TOP of the Edit step (a separate layer
 * from Cut settings, which now always stays SegmentQuickFields). Mirrors CapCut/Premiere's
 * selected-element properties bar - a titled surface with its controls laid out in a wrapping row,
 * so there's no wide empty gutter the old vertical panel would have left when stretched full-width.
 *
 * `border` shorthand is written out as its longhand equivalents - see HeaderBar.styles.ts's comment
 * for why (StyleX silently drops the shorthand form).
 */
export const styles = stylex.create({
  bar: {
    display: "flex",
    flexDirection: "column",
    gap: spacingVars["--spacing-2"],
    backgroundColor: colorVars["--color-background-surface"],
    borderRadius: radiusVars["--radius-element"],
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colorVars["--color-border"],
    paddingBlock: spacingVars["--spacing-2"],
    paddingInline: spacingVars["--spacing-3"],
  },
  header: {
    alignSelf: "stretch",
  },
  panelTitle: {
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  // Pushes the trailing control (Close in the header, Remove in the controls row) to the far edge.
  spacer: {
    flexGrow: 1,
  },
  controls: {
    alignSelf: "stretch",
  },
  readonlyText: {
    fontSize: textSizeVars["--font-size-sm"],
    color: colorVars["--color-text-secondary"],
  },
  emptyNote: {
    fontSize: textSizeVars["--font-size-sm"],
    color: colorVars["--color-text-secondary"],
  },
});
