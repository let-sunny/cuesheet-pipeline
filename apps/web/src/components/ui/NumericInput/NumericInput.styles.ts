import * as stylex from "@stylexjs/stylex";

/** Owned solely by NumericInput. Astryx `TextInput`'s own `width` prop only sizes the outer
 * `Field` it wraps itself in - which is a no-op in `horizontal-labels` mode (confirmed via Field's
 * dist source, see NumericInput.tsx's file comment) - so narrowing the actual bordered input box
 * goes through `xstyle` instead, which TextInput applies straight onto that box regardless of
 * which Field layout branch surrounds it. Parameterized (not a fixed rule) since call sites need
 * different widths (Cut settings' In/Out/Speed/Volume at 80px vs style-panel Size/Outline width at
 * a wider budget) - same dynamic-stylex-function pattern Astryx's own `Field.tsx` uses for its
 * `width` prop. */
export const styles = stylex.create({
  width: (width: number | string) => ({ width }),
});
