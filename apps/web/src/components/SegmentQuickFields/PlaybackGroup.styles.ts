import * as stylex from "@stylexjs/stylex";
import { colorVars, textSizeVars } from "@astryxdesign/core/theme/tokens.stylex";

/** Owned solely by PlaybackGroup - see RangeGroup.styles.ts's comment for why `groupBorder`/
 * `groupLabel`/`plainField` are duplicated per group component rather than shared globally. */
export const styles = stylex.create({
  groupBorder: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopStyle: "dashed",
    borderTopColor: colorVars["--color-border-emphasized"],
  },
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
  inputNarrow: {
    width: 80,
  },
  note: {
    margin: "4px 0 0",
    fontSize: textSizeVars["--font-size-sm"],
    color: colorVars["--color-text-yellow"],
  },
});
