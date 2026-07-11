import * as stylex from "@stylexjs/stylex";
import {
  colorVars,
  radiusVars,
  spacingVars,
  textSizeVars,
} from "@astryxdesign/core/theme/tokens.stylex";

/** Owned solely by SubtitleGroup - see RangeGroup.styles.ts's comment for why `groupBorder`/
 * `groupLabel` are duplicated per group component rather than shared globally. The Style preset
 * field's native-select chrome (`plainField`/`selectMedium`) is gone (2026-07-11 stock-input
 * migration) - it's now a stock Astryx `Selector` via the shared `ui/SelectField` adapter.
 * `subtitleTextarea` stays a native `<textarea>` (no stock Astryx multi-line text input exists to
 * replace it) - its `resize: vertical` is applied directly to the textarea itself (this component
 * owns that element directly in JSX, so there's no need for a descendant selector).
 *
 * Radius/spacing migration (2026-07-11, design-principles.md #5 strict rule): `padding`/`margin`/
 * `borderRadius` read from Astryx's `spacingVars`/`radiusVars` (the textarea is an input -
 * `--radius-element`). */
export const styles = stylex.create({
  groupLabel: {
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  // The old shared textarea-variant marker class's 6px 8px padding (vs the plain input's 4px 8px)
  // + full-width sizing.
  subtitleTextarea: {
    font: "inherit",
    color: "inherit",
    backgroundColor: colorVars["--color-background-surface"],
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colorVars["--color-border"],
    borderRadius: radiusVars["--radius-element"],
    padding: `${spacingVars["--spacing-1-5"]} ${spacingVars["--spacing-2"]}`,
    width: "100%",
    boxSizing: "border-box",
    resize: "vertical",
  },
  note: {
    margin: `${spacingVars["--spacing-1"]} 0 0`,
    fontSize: textSizeVars["--font-size-sm"],
    color: colorVars["--color-warning"],
  },
});
