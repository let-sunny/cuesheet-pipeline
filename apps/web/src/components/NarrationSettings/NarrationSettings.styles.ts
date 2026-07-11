import * as stylex from "@stylexjs/stylex";
import { colorVars } from "@astryxdesign/core/theme/tokens.stylex";

/**
 * Component anatomy migration (docs/styling-migration.md) — split out of the old shared
 * `FinishingSettings/` folder once SubtitleStyleSettings/NarrationSettings became separate
 * per-section components (CLAUDE.md's "groups are components, panels are arrangements" rule,
 * applied to the Export step's sections).
 *
 * 2026-07-11 stock-audit completion pass: `.settings-group`/`.settings-field`/`.settings-note` are
 * gone from this component (now a stock Astryx `Section`/`Heading`/`TextInput`/`Text`), and the
 * old `narrationGuide` paragraph style is gone with the `<p>` it styled (now Astryx `Text`).
 * `numberInput` ports the old shared plain-input marker class's look 1:1 for the ducking fade
 * field (a native `<input>` bound to useNumericField - see that hook's file comment), now owned
 * solely by this component instead of a global class.
 */
export const styles = stylex.create({
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
