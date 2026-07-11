import * as stylex from "@stylexjs/stylex";
import { colorVars, radiusVars, spacingVars } from "@astryxdesign/core/theme/tokens.stylex";

/**
 * Ported 1:1 from the old `.color-field-inputs`(+`input[type=color]`/`input[type=text]`) rule in
 * styles.css - now owned solely by this component instead of a shared global marker class.
 * `border` is written out as its longhand equivalents (`borderWidth`+`borderStyle`+`borderColor`) -
 * see HeaderBar.styles.ts's comment for why (StyleX silently drops the shorthand form).
 *
 * Radius/spacing migration (2026-07-11, design-principles.md #5 strict rule): `gap`/`padding`/
 * `borderRadius` read from Astryx's `spacingVars`/`radiusVars` - both inputs get `--radius-element`
 * (small input boxes). Structural sizing (`width`/`height` on the swatch input) stays literal.
 */
export const styles = stylex.create({
  row: {
    display: "flex",
    alignItems: "center",
    gap: spacingVars["--spacing-1-5"],
    flex: "0 0 auto",
  },
  colorInput: {
    width: 32,
    height: 26,
    padding: 0,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colorVars["--color-border"],
    borderRadius: radiusVars["--radius-element"],
    backgroundColor: "transparent",
    cursor: "pointer",
  },
  hexInput: {
    width: 90,
    font: "inherit",
    color: "inherit",
    backgroundColor: colorVars["--color-background-surface"],
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colorVars["--color-border"],
    borderRadius: radiusVars["--radius-element"],
    padding: `${spacingVars["--spacing-1"]} ${spacingVars["--spacing-2"]}`,
  },
});
