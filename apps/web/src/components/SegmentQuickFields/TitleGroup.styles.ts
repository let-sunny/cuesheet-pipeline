import * as stylex from "@stylexjs/stylex";
import { colorVars } from "@astryxdesign/core/theme/tokens.stylex";

/** Owned solely by TitleGroup - see RangeGroup.styles.ts's comment for why `groupBorder`/
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
  inputFull: {
    width: "100%",
    boxSizing: "border-box",
  },
  selectMedium: {
    width: 180,
  },
  inputNarrow: {
    width: 80,
  },
});
