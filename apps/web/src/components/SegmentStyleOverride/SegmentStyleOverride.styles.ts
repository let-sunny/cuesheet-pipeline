import * as stylex from "@stylexjs/stylex";
import { colorVars } from "@astryxdesign/core/theme/tokens.stylex";

/**
 * Component anatomy migration (docs/styling-migration.md) — rules ported 1:1 from the old
 * `.qf-style-override`/`.qf-style-override-toggle`/`.style-override-actions` classes in
 * styles.css (all owned solely by this component).
 *
 * `.style-override-fields`/`.settings-field`/`.color-field-inputs` are gone from this component
 * (2026-07-11 stock-audit completion pass) - the field set is now a stock Astryx
 * `FormLayout`/`Field` (matching SubtitleStyleSettings.tsx's own arrangement, since the two
 * intentionally share this control pattern), with color fields on the shared `ui/ColorField`
 * wrapper. `fields` below replaces `.style-override-fields`'s layout, and `numberInput` ports the
 * old shared `.plain-field` marker class's look 1:1 for the Size field (a native `<input>` bound to
 * useNumericField - see that hook's file comment), now owned solely by this component instead of a
 * global class. `.swatch` was migrated separately (batch 4) into its own `components/Swatch/`
 * component, now used indirectly via `ui/ColorField`.
 *
 * `override`'s left border/padding (marking this as "belongs to Subtitle") was dropped
 * (2026-07-11 QA fix, design-principles.md #4 "remove unnecessary decoration") - its nested DOM
 * position inside the Subtitle group already conveys that without an extra rule.
 */
export const styles = stylex.create({
  override: {
    marginTop: 10,
  },
  toggle: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  fields: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    marginTop: 8,
  },
  numberInput: {
    font: "inherit",
    color: "inherit",
    backgroundColor: colorVars["--color-background-surface"],
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colorVars["--color-border"],
    borderRadius: 4,
    padding: "4px 8px",
    maxWidth: 140,
  },
  actions: {
    display: "flex",
    gap: 8,
    marginTop: 4,
  },
});
