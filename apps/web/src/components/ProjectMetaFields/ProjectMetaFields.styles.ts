import * as stylex from "@stylexjs/stylex";
import { colorVars } from "@astryxdesign/core/theme/tokens.stylex";

/**
 * Astryx catalog migration (Finish/Export step rebuild, docs/design-principles.md) — this
 * component composes stock `FormLayout`/`Field`/`TextInput` (see ProjectMetaFields.tsx) instead of
 * the hand-rolled `.settings-field` markup. The only remaining raw elements are the `<input>`s
 * bound to `useNumericField` (FPS/Width/Height/Fade), whose transient-text/commit contract doesn't
 * match Astryx NumberInput's value/onChange/onBlur shape - `numberInput` below ports the old shared
 * `.plain-field` marker class's look 1:1, now owned solely by this component instead of a global
 * class (2026-07-11 stock-audit completion pass - `.plain-field` still exists in styles.css for
 * other, not-yet-migrated components, but this one no longer references it).
 */
export const styles = stylex.create({
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
});
