import * as stylex from "@stylexjs/stylex";
import { colorVars, radiusVars, textSizeVars } from "@astryxdesign/core/theme/tokens.stylex";

/**
 * Cut-settings grid migration (2026-07-11): `panel` replaces the old shared panel-shell class
 * (styles.css) - now owned solely by this component instead of a class also reused by
 * BgmSettingsPanel (which keeps its own copy in BgmSettingsPanel.styles.ts, same duplication
 * precedent as `numberInput` elsewhere). `groupBorder`/`groupLabel`/`plainField`/`selectMedium`
 * mirror RangeGroup.styles.ts's copies, for the Narration group kept inline here (see this file's
 * own doc comment on why Narration isn't promoted to its own group component). `dangerZone`
 * replaces the old danger-zone class.
 *
 * `border` shorthand is written out as its longhand equivalents (`borderTopWidth`/
 * `borderTopStyle`/`borderTopColor`) - see HeaderBar.styles.ts's comment for why (StyleX silently
 * drops the shorthand form).
 */
export const styles = stylex.create({
  // Padding is set via VStack's own `paddingBlock`/`paddingInline` props (component props first,
  // per the Astryx cheat sheet's "Custom styling" rule) - only background/radius need xstyle here.
  panel: {
    backgroundColor: colorVars["--color-background-surface"],
    borderRadius: radiusVars["--radius-element"],
  },
  groupBorder: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopStyle: "dashed",
    borderTopColor: colorVars["--color-border-emphasized"],
  },
  groupLabel: {
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  plainField: {
    font: "inherit",
    color: "inherit",
    backgroundColor: colorVars["--color-background-surface"],
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colorVars["--color-border"],
    borderRadius: 4,
    padding: "4px 8px",
  },
  selectMedium: {
    width: 180,
  },
  narrationEmptyNote: {
    margin: "4px 0 0",
    fontSize: textSizeVars["--font-size-sm"],
    color: colorVars["--color-text-secondary"],
  },
  narrationWarning: {
    margin: "4px 0 0",
    fontSize: textSizeVars["--font-size-sm"],
    color: colorVars["--color-text-yellow"],
  },
  narrationPreview: {
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopStyle: "dashed",
    borderTopColor: colorVars["--color-border-emphasized"],
  },
  narrationAudio: {
    width: "100%",
    height: 32,
  },
  dangerZone: {
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopStyle: "dashed",
    borderTopColor: colorVars["--color-border-red"],
  },
});
