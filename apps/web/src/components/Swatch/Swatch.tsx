import * as stylex from "@stylexjs/stylex";
import { styles } from "./Swatch.styles.js";

interface Props {
  /** CSS color value to preview (hex/rgb(a)/etc) - passed straight to a `background` inline style. */
  color: string;
}

/**
 * Small inline color-preview chip shown next to a color field's label. Shared by three call sites
 * (FinishingSettings' global subtitle style, SegmentStyleOverride's per-cut override,
 * SubtitleStylePresetsSettings' preset editor) that all rendered the identical
 * `<span className="swatch" style={{ background: color }} />` pattern before this extraction.
 */
export function Swatch({ color }: Props) {
  return <span {...stylex.props(styles.swatch)} style={{ background: color }} />;
}
