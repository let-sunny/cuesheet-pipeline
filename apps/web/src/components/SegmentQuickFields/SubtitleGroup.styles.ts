import * as stylex from "@stylexjs/stylex";
import { colorVars, textSizeVars } from "@astryxdesign/core/theme/tokens.stylex";

/** Owned solely by SubtitleGroup - see RangeGroup.styles.ts's comment for why `groupBorder`/
 * `groupLabel`/`plainField` are duplicated per group component rather than shared globally.
 * `subtitleTextarea`'s `resize: vertical` is applied directly to the textarea itself (this
 * component owns that element directly in JSX, so there's no need for a descendant selector). */
export const styles = stylex.create({
  groupLabel: {
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  plainField: {
    font: "inherit",
    color: "inherit",
    backgroundColor: colorVars["--color-background-surface"],
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colorVars["--color-border"],
    borderRadius: 4,
    padding: "4px 8px",
  },
  // The old shared textarea-variant marker class's 6px 8px padding (vs the plain input's 4px 8px)
  // + full-width sizing.
  subtitleTextarea: {
    font: "inherit",
    color: "inherit",
    backgroundColor: colorVars["--color-background-surface"],
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colorVars["--color-border"],
    borderRadius: 4,
    padding: "6px 8px",
    width: "100%",
    boxSizing: "border-box",
    resize: "vertical",
  },
  selectMedium: {
    width: 180,
  },
  note: {
    margin: "4px 0 0",
    fontSize: textSizeVars["--font-size-sm"],
    color: colorVars["--color-text-yellow"],
  },
});
