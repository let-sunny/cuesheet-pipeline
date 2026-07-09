import * as stylex from "@stylexjs/stylex";

/**
 * Component anatomy migration (docs/styling-migration.md) — rules ported 1:1 from the old
 * `.bgm-file-*` classes in styles.css.
 *
 * Only `.bgm-file-list` (the scrollable column wrapper) and `.bgm-file-row` (a plain div, no
 * `.plain-button`) migrate cleanly - neither has any property overlap with a shared marker class.
 *
 * `.bgm-file-play`/`.bgm-file-name` stay entirely in styles.css (NOT migrated), because both
 * buttons also carry the shared `.plain-button` marker class and both override one of
 * `.plain-button`'s own properties: `.bgm-file-play` overrides `padding` (plain-button sets
 * `padding: 6px 12px`), `.bgm-file-name` overrides `font-size` (plain-button's `font: inherit`
 * shorthand implicitly sets font-size too). Verified by screenshot diff (AE, batch 2): moving
 * either to StyleX measurably grew the button (padding/font-size silently reverting to
 * `.plain-button`'s values) because this app's StyleX output is injected before styles.css, so a
 * same-specificity StyleX atomic class loses the cascade tie to a later-in-source `.plain-button`
 * rule - same root cause as HeaderBar's theme toggle buttons and RenderSettingsDialog's
 * resolution preset buttons (see those files' comments), just via `padding`/`font-size` here
 * instead of `background`/`border`. `.bgm-file-row.selected .bgm-file-name`'s background/
 * border-color override survives for the same reason (higher specificity, 3 classes, beats the
 * tie) - see the comment on that rule in styles.css.
 */
export const styles = stylex.create({
  fileList: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    maxHeight: 220,
    overflowY: "auto",
  },
  fileRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
});
