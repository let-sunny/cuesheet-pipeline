import * as stylex from "@stylexjs/stylex";

/**
 * Component anatomy migration (docs/styling-migration.md) — rules ported 1:1 from the old
 * `.qf-style-override`/`.qf-style-override-toggle`/`.style-override-actions` classes in
 * styles.css (all owned solely by this component).
 *
 * Left behind in styles.css (not migrated): `.style-override-fields` (shared with
 * SubtitleStylePresetsSettings.tsx, which reuses the same field-set layout for editing a named
 * preset — out of scope for this migration batch), and `.settings-field`/`.color-field-inputs`/
 * `.swatch` (shared width-token/marker classes used by several not-yet-migrated components).
 *
 * `border` shorthand written as its longhand equivalents (`borderLeftWidth`/`borderLeftStyle`/
 * `borderLeftColor`) — see HeaderBar.styles.ts's comment for why (StyleX silently drops the
 * shorthand form).
 */
export const styles = stylex.create({
  override: {
    marginTop: 10,
    paddingLeft: 10,
    borderLeftWidth: 2,
    borderLeftStyle: "solid",
    borderLeftColor: "var(--border-dashed)",
  },
  toggle: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  actions: {
    display: "flex",
    gap: 8,
    marginTop: 4,
  },
});
