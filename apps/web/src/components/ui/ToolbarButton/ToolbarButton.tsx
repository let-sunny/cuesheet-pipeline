import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import type { ButtonProps } from "@astryxdesign/core/Button";

const styles = stylex.create({
  compact: {
    fontSize: 12,
    paddingBlock: "3px",
    paddingInline: "10px",
  },
});

/**
 * Role: an Astryx Button sized down further than any built-in `size`, for narrow, text-dense
 * action rows (e.g. the crop-edit overlay's action strip) where even `size="sm"` is still too
 * roomy. Same API as Button — this wrapper only adds the compact xstyle on top.
 *
 * Promoted from a tweak that was repeated at 4 call sites (CLAUDE.md "Component layering": the
 * same customization at 2+ call sites is promoted to a named wrapper instead of scattering
 * xstyle/style per instance).
 */
export function ToolbarButton(props: ButtonProps) {
  const { xstyle, ...rest } = props;
  return <Button {...rest} xstyle={[styles.compact, xstyle]} />;
}
