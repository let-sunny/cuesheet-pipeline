import * as stylex from "@stylexjs/stylex";

/**
 * Component anatomy migration (docs/styling-migration.md, StyleX migration batch 4) — ported 1:1
 * from the old `.swatch` class in styles.css. It used to be a shared token living in the base
 * stylesheet because three separate components rendered the same raw span; extracted here as its
 * own small presentational component instead, so the shape lives with the one component that owns
 * it and every call site imports `<Swatch color={...} />` rather than repeating the raw span.
 */
export const styles = stylex.create({
  swatch: {
    display: "inline-block",
    width: 12,
    height: 12,
    borderRadius: 2,
    verticalAlign: "middle",
    marginRight: 4,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#00000055",
  },
});
