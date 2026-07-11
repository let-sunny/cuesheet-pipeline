import * as stylex from "@stylexjs/stylex";
import { colorVars } from "@astryxdesign/core/theme/tokens.stylex";

/**
 * Ported 1:1 from the old `.color-field-inputs`(+`input[type=color]`/`input[type=text]`) rule in
 * styles.css - now owned solely by this component instead of a shared global marker class.
 * `border` is written out as its longhand equivalents (`borderWidth`+`borderStyle`+`borderColor`) -
 * see HeaderBar.styles.ts's comment for why (StyleX silently drops the shorthand form).
 */
export const styles = stylex.create({
  row: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flex: "0 0 auto",
  },
  colorInput: {
    width: 32,
    height: 26,
    padding: 0,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colorVars["--color-border"],
    borderRadius: 4,
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
    borderRadius: 4,
    padding: "4px 8px",
  },
});
