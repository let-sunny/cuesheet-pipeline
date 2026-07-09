import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import type { ButtonProps } from "@astryxdesign/core/Button";

const styles = stylex.create({
  equalWidth: {
    flex: 1,
    minWidth: 0,
    paddingBlock: "6px",
    paddingInline: "4px",
  },
});

/**
 * Role: an Astryx Button for a full-width action inside a scene candidate card (e.g.
 * MomentPalette's Add/Remove toggle) — flexes to fill the row instead of sizing to its own
 * label. Same API as Button — this wrapper only adds the equal-width xstyle on top.
 *
 * Promoted from a tweak that was repeated at 2 call sites (CLAUDE.md "Component layering").
 */
export function SceneCardButton(props: ButtonProps) {
  const { xstyle, ...rest } = props;
  return <Button {...rest} xstyle={[styles.equalWidth, xstyle]} />;
}
