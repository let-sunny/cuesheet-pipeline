import * as stylex from "@stylexjs/stylex";
import { colorVars } from "@astryxdesign/core/theme/tokens.stylex";

/**
 * Ported 1:1 from the old `.preset-preview-chip`/`.preset-preview-text`/`.plain-field` rules in
 * styles.css (2026-07-11 stock-audit completion pass) - `.preset-row`/`.preset-row-header` became
 * a stock Astryx `Section`(dividers)/`HStack` instead (see SubtitleStylePresetsSettings.tsx), and
 * the color composites moved to the shared `ui/ColorField` wrapper, but the compact subtitle-style
 * preview chip has no stock equivalent (an always-dark preview stage over which the sample text is
 * always rendered light, regardless of theme - same reasoning as `--stage-bg` and its "flagged
 * literal" color:#ffffff carve-out documented in styles.css).
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
    borderRadius: 6,
    backgroundColor: "var(--stage-bg)",
    overflow: "hidden",
    containerType: "inline-size",
  },
  previewText: {
    whiteSpace: "nowrap",
    color: "#ffffff",
  },
  numberInput: {
    font: "inherit",
    color: "inherit",
    backgroundColor: colorVars["--color-background-surface"],
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colorVars["--color-border"],
    borderRadius: 4,
    padding: "4px 8px",
    maxWidth: 140,
  },
});
