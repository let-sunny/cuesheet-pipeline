import * as stylex from "@stylexjs/stylex";

/**
 * Component anatomy exemplar (CLAUDE.md "component layering"): styles live in their own
 * co-located stylex.create() file rather than inline in the component, so xstyle-able static
 * rules stay separate from the per-frame dynamic values (positions/opacities) that must be plain
 * inline `style` (see screen-spec.md rule 8 - xstyle for static, style for dynamic/conditional).
 */
export const styles = stylex.create({
  container: {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    overflow: "hidden",
  },
  backdrop: {
    // backgroundColor, NOT the `background` shorthand: StyleX silently drops the shorthand form in
    // this repo (same reason border/etc. are written longhand - see HeaderBar.styles.ts), which
    // left this backdrop transparent so the Backdrop dim slider had no visible effect (2026-07-12).
    position: "absolute",
    inset: 0,
    backgroundColor: "#000000",
  },
  stage: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
});
