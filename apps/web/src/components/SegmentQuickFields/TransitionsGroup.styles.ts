import * as stylex from "@stylexjs/stylex";
import { colorVars, spacingVars, textSizeVars } from "@astryxdesign/core/theme/tokens.stylex";

/** Owned solely by TransitionsGroup - see RangeGroup.styles.ts's comment for why `groupBorder`/
 * `groupLabel` are duplicated per group component rather than shared globally. The Type/Dur.
 * fields' native-input chrome (`plainField`/`selectMedium`/`inputNarrow`) is gone (2026-07-11
 * stock-input migration) - they're now a stock Astryx `Selector`/`TextInput` via the shared
 * `ui/SelectField`/`ui/NumericInput` adapters. */
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
  transition: {
    marginBottom: spacingVars["--spacing-2"],
  },
  noteNeutral: {
    margin: `${spacingVars["--spacing-1"]} 0 0`,
    fontSize: textSizeVars["--font-size-sm"],
    color: colorVars["--color-text-secondary"],
  },
  noteWarning: {
    margin: `${spacingVars["--spacing-1"]} 0 0`,
    fontSize: textSizeVars["--font-size-sm"],
    color: colorVars["--color-warning"],
  },
});
