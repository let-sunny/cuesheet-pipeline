import * as stylex from "@stylexjs/stylex";
import {
  colorVars,
  fontWeightVars,
  spacingVars,
  textSizeVars,
} from "@astryxdesign/core/theme/tokens.stylex";

/** Owned solely by RangeGroup (2026-07-11 Cut-settings grid migration). `groupLabel`/`groupBorder`
 * replace the old shared group-label/group-border rules (styles.css) - each group component now
 * owns its own copy. `groupBorder`'s dashed top border is skipped via the `isFirst` prop when this
 * group renders first in its tab (replaces the old shared-CSS first-child exception, which relied
 * on this being the first DOM child under a shared panel-shell parent - now that each group is its
 * own component, the panel tells it explicitly instead). In/Out's native-input chrome
 * (`plainField`/`inputNarrow`) is gone (2026-07-11 stock-input migration) - they're now a stock
 * Astryx `TextInput` via the shared `ui/NumericInput` adapter, which gets its width via `xstyle`
 * instead of a co-located rule. */
export const styles = stylex.create({
  groupBorder: {
    paddingTop: spacingVars["--spacing-1-5"],
    borderTopWidth: 1,
    borderTopStyle: "dashed",
    borderTopColor: colorVars["--color-border-emphasized"],
  },
  groupLabel: {
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  readonlyValue: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "auto",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: textSizeVars["--font-size-sm"],
    color: colorVars["--color-text-primary"],
  },
  // Length readout's error treatment when in >= out (rangeError set) - same "error" color token
  // IntroOutroEditor/MomentPalette already use for their own inline validation notes.
  lengthErrorText: {
    color: colorVars["--color-error"],
    fontWeight: fontWeightVars["--font-weight-semibold"],
  },
  rangeError: {
    margin: `${spacingVars["--spacing-1"]} 0 0`,
    fontSize: textSizeVars["--font-size-sm"],
    color: colorVars["--color-error"],
  },
});
