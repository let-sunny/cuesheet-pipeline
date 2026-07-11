import * as stylex from "@stylexjs/stylex";
import {
  colorVars,
  radiusVars,
  spacingVars,
  textSizeVars,
} from "@astryxdesign/core/theme/tokens.stylex";

/** Component anatomy migration (docs/styling-migration.md) — rules ported 1:1 from the old
 * `.keyboard-help*` classes in styles.css.
 *
 * `background`/`border`/`font` shorthands are written out as their longhand equivalents
 * (`backgroundColor`, `borderWidth`+`borderStyle`+`borderColor`, `fontFamily`) throughout - a
 * screenshot-diff check found this StyleX setup silently drops the shorthand form (computed
 * background stayed transparent, border-width stayed 0) while the longhand form compiles and
 * applies correctly. See HeaderBar.styles.ts for the same fix.
 *
 * Radius/spacing migration (2026-07-11, design-principles.md #5 strict rule): `gap`/`padding`/
 * `borderRadius` read from Astryx's `spacingVars`/`radiusVars`, snapped to the nearest step where
 * a value fell between two (10 -> 8, ties round down per the existing repo convention - see
 * MomentPalette.styles.ts's own comment). `note`/`list` are the KeyboardHelp panel's visible boxes,
 * so both get `--radius-container` per the task's explicit mapping. `kbd`'s "1px 5px" padding keeps
 * its 1px vertical value literal (below the smallest spacing step; matches the same "1px <token>"
 * pattern already established in CompactSegmentList.styles.ts), tokenizing only the horizontal
 * value. `listItem`'s "3px 0" padding stays fully literal for the same reason (a sub-grid
 * micro-padding on a tight list row, matching CompactSegmentList.styles.ts's own "3px 6px"
 * precedent). `panel`'s `right`/`bottom` are viewport-corner positioning, not spacing between
 * elements, so they stay literal.
 */
export const styles = stylex.create({
  panel: {
    position: "fixed",
    right: 16,
    bottom: 16,
    zIndex: 10,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: spacingVars["--spacing-1-5"],
  },
  toggle: {
    fontSize: textSizeVars["--font-size-sm"],
  },
  note: {
    margin: 0,
    padding: `${spacingVars["--spacing-2"]} ${spacingVars["--spacing-3"]}`,
    backgroundColor: colorVars["--color-background-surface"],
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colorVars["--color-border"],
    borderRadius: radiusVars["--radius-container"],
    fontSize: textSizeVars["--font-size-sm"],
    color: colorVars["--color-text-secondary"],
    maxWidth: 280,
  },
  list: {
    listStyle: "none",
    margin: 0,
    padding: `${spacingVars["--spacing-2"]} ${spacingVars["--spacing-3"]}`,
    backgroundColor: colorVars["--color-background-surface"],
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colorVars["--color-border"],
    borderRadius: radiusVars["--radius-container"],
    fontSize: textSizeVars["--font-size-sm"],
    maxWidth: 280,
  },
  listItem: {
    display: "flex",
    justifyContent: "space-between",
    gap: spacingVars["--spacing-3"],
    padding: "3px 0",
  },
  kbd: {
    fontFamily: "inherit",
    color: colorVars["--color-text-primary"],
    backgroundColor: colorVars["--color-background-muted"],
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colorVars["--color-border"],
    borderRadius: radiusVars["--radius-element"],
    padding: `1px ${spacingVars["--spacing-1"]}`,
    whiteSpace: "nowrap",
  },
});
