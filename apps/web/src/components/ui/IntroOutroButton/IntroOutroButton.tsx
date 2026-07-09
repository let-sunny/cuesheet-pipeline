import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import type { ButtonProps } from "@astryxdesign/core/Button";

const styles = stylex.create({
  base: {
    flex: 1,
    minWidth: 0,
    paddingBlock: "4px",
    paddingInline: "4px",
    fontSize: 12,
    borderColor: "var(--border-dashed)",
    color: "var(--text-tertiary)",
    backgroundColor: "transparent",
  },
  active: {
    borderColor: "var(--tag-blue-border)",
    color: "var(--tag-blue-text)",
    backgroundColor: "var(--tag-blue-bg)",
  },
});

interface Props extends Omit<ButtonProps, "variant"> {
  /** Whether this clip is currently assigned (e.g. as the intro/outro) — swaps to the accent look. */
  active: boolean;
}

/**
 * Role: a ghost Astryx Button styled as a small assignment-toggle chip (e.g. MomentPalette's
 * "Set as intro"/"Set as outro") — muted by default, accent-tinted once assigned. Same API as
 * Button plus `active`; always renders as `variant="ghost"` internally.
 *
 * Promoted from a tweak that was repeated at 2 call sites (CLAUDE.md "Component layering").
 */
export function IntroOutroButton({ active, xstyle, ...rest }: Props) {
  return <Button {...rest} variant="ghost" xstyle={[styles.base, active && styles.active, xstyle]} />;
}
