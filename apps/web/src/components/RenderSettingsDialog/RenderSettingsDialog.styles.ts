import * as stylex from "@stylexjs/stylex";
import { colorVars, spacingVars, textSizeVars } from "@astryxdesign/core/theme/tokens.stylex";

/**
 * Component anatomy migration (docs/styling-migration.md) — rules ported 1:1 from the old
 * `.render-dialog`/`.render-resolution-options*`/`.render-dialog-summary-line`/
 * `.render-dialog-actions` classes in styles.css.
 *
 * Left behind in styles.css (not migrated): `.settings-group` (shared with SubtitleStyleSettings/
 * NarrationSettings/IntroOutroEditor/ProjectMetaFields/App — this component still renders it as a plain
 * className), `.render-dialog .settings-group` (the descendant override that turns off that
 * shared class's flex-grow inside this dialog — can't move to stylex since the target class
 * itself stays a plain global token), and `.render-note`/`.render-note-error` (shared with
 * App.tsx's own render-note banner).
 *
 * The resolution preset toggle is now a stock Astryx SegmentedControl (2026-07-11 stock-component
 * migration) - the old `.render-resolution-options button.active` plain-CSS exception and this
 * file's own `resolutionOptions` wrapper xstyle are both gone with it.
 *
 * Spacing migration (2026-07-11, design-principles.md #5 strict rule, same reasoning as
 * MomentPalette.styles.ts's comment): `gap`/`margin` read from Astryx's `spacingVars`.
 */
export const styles = stylex.create({
  dialog: {
    display: "flex",
    flexDirection: "column",
    gap: spacingVars["--spacing-4"],
  },
  summaryLine: {
    margin: `0 0 ${spacingVars["--spacing-1"]}`,
    fontSize: textSizeVars["--font-size-sm"],
    color: colorVars["--color-text-primary"],
  },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: spacingVars["--spacing-2"],
  },
});
