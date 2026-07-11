import * as stylex from "@stylexjs/stylex";
import { textSizeVars } from "@astryxdesign/core/theme/tokens.stylex";
import { ToggleButton } from "@astryxdesign/core/ToggleButton";
import type { ToggleButtonProps } from "@astryxdesign/core/ToggleButton";

const styles = stylex.create({
  small: {
    fontSize: textSizeVars["--font-size-xs"],
  },
});

/**
 * Role: an Astryx ToggleButton with its label font pinned to a small token, for the Scenes
 * category/status filter chip rows (MomentPalette) — ToggleButton delegates to Button, whose font
 * is fixed at `--text-label-size` regardless of `size`, so even `size="sm"` chips still read as
 * body-size text (2026-07-11 typography pass, design-principles.md #6 "dense, 13-inch"). Same API
 * as ToggleButton — this wrapper only adds the small xstyle on top. Promoted straight to a wrapper
 * (CLAUDE.md "component layering": every chip in both filter rows needed the identical override).
 */
export function FilterChip(props: ToggleButtonProps) {
  const { xstyle, ...rest } = props;
  return <ToggleButton {...rest} xstyle={[styles.small, xstyle]} />;
}
