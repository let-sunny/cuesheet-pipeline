import * as stylex from "@stylexjs/stylex";
import { colorVars, spacingVars, textSizeVars } from "@astryxdesign/core/theme/tokens.stylex";

/**
 * Component anatomy migration (docs/styling-migration.md) — rules ported 1:1 from the old
 * `.render-dialog`/`.render-resolution-options*`/`.render-dialog-summary-line`/
 * `.render-dialog-actions` classes in styles.css.
 *
 * 2026-07-11 stock-audit completion pass: `.settings-group`/`.render-dialog`/`.render-note`/
 * `.render-note-error` are all gone from this component - the 3 resolution/subtitles/summary
 * groups are now stock Astryx `Section`(transparent)/`Heading`/`VStack` (each section just takes
 * up its content's height by default, so the old `.render-dialog .settings-group { flex: 0 1
 * auto }` descendant override that used to turn off `.settings-group`'s shared flex-grow no longer
 * has anything to override), and the resolution/dirty notes are `Text`. `dirtyNote` below is the
 * one property (`--color-warning`) `Text`'s own `color` prop has no option for.
 *
 * The resolution preset toggle is now a stock Astryx SegmentedControl (2026-07-11 stock-component
 * migration) - the old `.render-resolution-options button.active` plain-CSS exception and this
 * file's own `resolutionOptions` wrapper xstyle are both gone with it.
 *
 * Spacing migration (2026-07-11, design-principles.md #5 strict rule, same reasoning as
 * MomentPalette.styles.ts's comment): `gap`/`margin` read from Astryx's `spacingVars`.
 */
export const styles = stylex.create({
  summaryLine: {
    margin: `0 0 ${spacingVars["--spacing-1"]}`,
    fontSize: textSizeVars["--font-size-sm"],
    color: colorVars["--color-text-primary"],
  },
  dirtyNote: {
    color: colorVars["--color-warning"],
  },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: spacingVars["--spacing-2"],
  },
});
