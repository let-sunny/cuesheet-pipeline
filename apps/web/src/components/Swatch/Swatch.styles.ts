import * as stylex from "@stylexjs/stylex";
import { colorVars, radiusVars, spacingVars } from "@astryxdesign/core/theme/tokens.stylex";

/**
 * Component anatomy migration (docs/styling-migration.md, StyleX migration batch 4) — ported 1:1
 * from the old `.swatch` class in styles.css. It used to be a shared token living in the base
 * stylesheet because three separate components rendered the same raw span; extracted here as its
 * own small presentational component instead, so the shape lives with the one component that owns
 * it and every call site imports `<Swatch color={...} />` rather than repeating the raw span.
 *
 * Radius/spacing migration (2026-07-11, design-principles.md #5 strict rule): `borderRadius`/
 * `marginRight` read from Astryx's `radiusVars`/`spacingVars` (a swatch is an "element"-tier small
 * box per the task's mapping). Structural sizing (`width`/`height: 12`) stays literal.
 */
export const styles = stylex.create({
  swatch: {
    display: "inline-block",
    width: 12,
    height: 12,
    borderRadius: radiusVars["--radius-element"],
    verticalAlign: "middle",
    marginRight: spacingVars["--spacing-1"],
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colorVars["--color-border"],
  },
});
