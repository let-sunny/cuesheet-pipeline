import * as stylex from "@stylexjs/stylex";
import { spacingVars } from "@astryxdesign/core/theme/tokens.stylex";

/**
 * Component anatomy migration (docs/styling-migration.md) — rules ported 1:1 from the old
 * per-cut style-override toggle/actions classes in styles.css (all owned solely by this
 * component).
 *
 * The old field-set/color-composite classes are gone from this component (2026-07-11 stock-audit
 * completion pass) - the field set is now a stock Astryx `FormLayout`/`Field` (matching
 * SubtitleStyleSettings.tsx's own arrangement, since the two intentionally share this control
 * pattern), with color fields on the shared `ui/ColorField` wrapper. `fields` below replaces that
 * old layout. The Size field's native-input chrome (`numberInput`) is gone (2026-07-11 stock-input
 * migration) - it's now a stock Astryx `TextInput` via the shared `ui/NumericInput` adapter, which
 * gets its width via `xstyle` instead of a co-located rule. `.swatch` was migrated separately
 * (batch 4) into its own `components/Swatch/` component, now used indirectly via `ui/ColorField`.
 *
 * `override`'s left border/padding (marking this as "belongs to Subtitle") was dropped
 * (2026-07-11 QA fix, design-principles.md #4 "remove unnecessary decoration") - its nested DOM
 * position inside the Subtitle group already conveys that without an extra rule.
 */
export const styles = stylex.create({
  override: {
    marginTop: spacingVars["--spacing-2"],
  },
  toggle: {
    display: "flex",
    alignItems: "center",
    gap: spacingVars["--spacing-1-5"],
  },
  fields: {
    display: "flex",
    flexDirection: "column",
    gap: spacingVars["--spacing-2"],
    marginTop: spacingVars["--spacing-2"],
  },
  actions: {
    display: "flex",
    gap: spacingVars["--spacing-2"],
    marginTop: spacingVars["--spacing-1"],
  },
});
