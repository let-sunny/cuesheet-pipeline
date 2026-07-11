import * as stylex from "@stylexjs/stylex";
import { radiusVars } from "@astryxdesign/core/theme/tokens.stylex";

/**
 * Ported 1:1 from the old `.preset-preview-chip`/`.preset-preview-text` rules in styles.css
 * (2026-07-11 stock-audit completion pass) - `.preset-row`/`.preset-row-header` became a stock
 * Astryx `Section`(dividers)/`HStack` instead (see SubtitleStylePresetsSettings.tsx), and the color
 * composites moved to the shared `ui/ColorField` wrapper, but the compact subtitle-style preview
 * chip has no stock equivalent (an always-dark preview stage over which the sample text is always
 * rendered light, regardless of theme - same reasoning as `--stage-bg` and its "flagged literal"
 * color:#ffffff carve-out documented in styles.css). The old plain-input-marker rule
 * (`numberInput`) is gone (2026-07-11 stock-input migration) - the Size field is now a stock Astryx
 * `TextInput`; `sizeField` is just its width (a stock TextInput needs no border/background/padding
 * chrome of its own).
 *
 * Radius migration (2026-07-11, design-principles.md #5 strict rule): `previewChip`'s
 * `borderRadius` reads from Astryx's `radiusVars` - it's a small compact chip (same shape as
 * VideoPreview.styles.ts's real preview panel), so it gets `--radius-element`, not `--container`.
 * Structural sizing (`height: 40`) stays literal.
 */
export const styles = stylex.create({
  previewChip: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "auto",
    minWidth: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: 40,
    borderRadius: radiusVars["--radius-element"],
    backgroundColor: "var(--stage-bg)",
    overflow: "hidden",
    containerType: "inline-size",
  },
  previewText: {
    whiteSpace: "nowrap",
    color: "#ffffff",
  },
  sizeField: {
    width: 140,
  },
});
