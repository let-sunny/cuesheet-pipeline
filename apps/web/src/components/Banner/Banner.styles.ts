import * as stylex from "@stylexjs/stylex";
import {
  colorVars,
  radiusVars,
  spacingVars,
  textSizeVars,
} from "@astryxdesign/core/theme/tokens.stylex";

/**
 * Component anatomy migration (docs/styling-migration.md, StyleX migration batch 4) — ported 1:1
 * from the old `.banner`/`.banner-actions` classes in styles.css. The color-variant rules
 * (`.banner.success`/`.banner.error`/`.banner.error ul`/`.banner.error pre`) were NOT migrated —
 * repo-wide grep found no call site ever applying those modifier classes (App.tsx's two banners
 * both render the plain look), so they were dead and deleted rather than ported.
 *
 * Radius/spacing migration (2026-07-11, design-principles.md #5 strict rule): `padding`/
 * `marginBottom`/`gap`/`borderRadius` read from Astryx's `spacingVars`/`radiusVars` - the banner
 * wrapper gets `--radius-container` per the task's explicit mapping.
 */
export const styles = stylex.create({
  banner: {
    padding: `${spacingVars["--spacing-3"]} ${spacingVars["--spacing-4"]}`,
    backgroundColor: colorVars["--color-background-muted"],
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colorVars["--color-border-emphasized"],
    borderRadius: radiusVars["--radius-container"],
    marginBottom: spacingVars["--spacing-4"],
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacingVars["--spacing-3"],
    fontSize: textSizeVars["--font-size-sm"],
  },
  actions: {
    display: "flex",
    flexShrink: 0,
    gap: spacingVars["--spacing-2"],
  },
});
