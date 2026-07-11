import * as stylex from "@stylexjs/stylex";
import { colorVars, spacingVars } from "@astryxdesign/core/theme/tokens.stylex";

/** Owned solely by ActionsGroup - see RangeGroup.styles.ts's comment for why `groupBorder`/
 * `groupLabel` are duplicated per group component rather than shared globally. */
export const styles = stylex.create({
  groupBorder: {
    paddingTop: spacingVars["--spacing-2"],
    borderTopWidth: 1,
    borderTopStyle: "dashed",
    borderTopColor: colorVars["--color-border-emphasized"],
  },
  groupLabel: {
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
});
