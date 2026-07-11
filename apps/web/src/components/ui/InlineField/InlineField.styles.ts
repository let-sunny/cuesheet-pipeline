import * as stylex from "@stylexjs/stylex";
import { spacingVars } from "@astryxdesign/core/theme/tokens.stylex";

/** Owned solely by InlineField. Overrides Field's own internal container styles (flexDirection:
 * column, a 4px gap) - passed last into Field's own `stylex.props()` call, so same-property
 * values here win over Field's base styles (StyleX resolves same-property conflicts by argument
 * order within one `stylex.props()` call - the later argument wins). */
export const styles = stylex.create({
  inline: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacingVars["--spacing-1-5"],
  },
});
