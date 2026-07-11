import * as stylex from "@stylexjs/stylex";
import { colorVars, spacingVars } from "@astryxdesign/core/theme/tokens.stylex";

/** Owned solely by TitleGroup - see RangeGroup.styles.ts's comment for why `groupBorder`/
 * `groupLabel` are duplicated per group component rather than shared globally. The Text/Preset/
 * Dur. fields' native-input chrome (`plainField`/`selectMedium`/`inputNarrow`) is gone (2026-07-11
 * stock-input migration) - they're now stock Astryx `TextInput`/`Selector` (the latter two via the
 * shared `ui/NumericInput`/`ui/SelectField` adapters). `inputFull` survives as the Text field's own
 * `xstyle` (TextInput's own `width` prop is a no-op in `horizontal-labels` mode - see
 * ui/NumericInput's file comment). */
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
  inputFull: {
    width: "100%",
    boxSizing: "border-box",
  },
});
