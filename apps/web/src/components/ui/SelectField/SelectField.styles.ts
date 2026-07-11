import * as stylex from "@stylexjs/stylex";

/** Owned solely by SelectField - same reasoning as NumericInput.styles.ts's dynamic `width` rule
 * (Astryx `Selector`'s own `width` prop only sizes the `Field` it wraps itself in, a no-op in
 * `horizontal-labels` mode, so narrowing the trigger box goes through `xstyle` instead). */
export const styles = stylex.create({
  width: (width: number | string) => ({ width }),
});
