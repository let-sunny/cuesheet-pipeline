import * as stylex from "@stylexjs/stylex";
import { colorVars, textSizeVars } from "@astryxdesign/core/theme/tokens.stylex";

/** Owned solely by PlaybackGroup - see RangeGroup.styles.ts's comment for why `groupBorder`/
 * `groupLabel` are duplicated per group component rather than shared globally. Speed/Volume's
 * native-input chrome (`plainField`/`inputNarrow`) is gone (2026-07-11 stock-input migration) -
 * they're now a stock Astryx `TextInput` via the shared `ui/NumericInput` adapter. */
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
  note: {
    margin: "4px 0 0",
    fontSize: textSizeVars["--font-size-sm"],
    color: colorVars["--color-text-yellow"],
  },
});
