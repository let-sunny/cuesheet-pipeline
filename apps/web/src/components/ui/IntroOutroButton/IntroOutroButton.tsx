import * as stylex from "@stylexjs/stylex";
import { IconButton } from "@astryxdesign/core/IconButton";
import type { IconButtonProps } from "@astryxdesign/core/IconButton";

const styles = stylex.create({
  base: {
    color: "var(--text-tertiary)",
  },
  active: {
    color: "var(--tag-blue-text)",
    backgroundColor: "var(--tag-blue-bg)",
  },
});

interface Props extends Omit<IconButtonProps, "variant"> {
  /** Whether this clip is currently assigned (e.g. as the intro/outro) — swaps to the accent look. */
  active: boolean;
}

/**
 * Role: an icon-only Astryx IconButton styled as a small assignment-toggle chip (e.g.
 * MomentPalette's "Set intro"/"Set outro") — muted by default, accent-tinted once assigned. Same
 * API as IconButton plus `active`; always renders as `variant="ghost"` internally.
 *
 * Converted from a text Button to an icon button (2026-07-11, design-principles.md #4 - repeated
 * row actions should be icon buttons, not text) - `label` stays required (IconButton forwards it
 * as the accessible name/aria-label) and callers should also pass `tooltip` for the visible hint
 * a screen has no room to spell out otherwise.
 */
export function IntroOutroButton({ active, xstyle, ...rest }: Props) {
  return <IconButton {...rest} variant="ghost" xstyle={[styles.base, active && styles.active, xstyle]} />;
}
