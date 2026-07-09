import * as stylex from "@stylexjs/stylex";

/**
 * Component anatomy migration (docs/styling-migration.md) — rules ported 1:1 from the old
 * `.render-dialog`/`.render-resolution-options*`/`.render-dialog-summary-line`/
 * `.render-dialog-actions` classes in styles.css.
 *
 * Left behind in styles.css (not migrated): `.settings-group` (shared with FinishingSettings/
 * IntroOutroEditor/ProjectMetaFields/App — this component still renders it as a plain
 * className), `.render-dialog .settings-group` (the descendant override that turns off that
 * shared class's flex-grow inside this dialog — can't move to stylex since the target class
 * itself stays a plain global token), and `.render-note`/`.render-note-error` (shared with
 * App.tsx's own render-note banner).
 *
 * `.render-resolution-options button.active` also stays plain CSS (not migrated) for the same
 * reason as HeaderBar's theme toggle buttons (see HeaderBar.styles.ts's comment for the full
 * explanation): these buttons carry the `.plain-button` marker class, this app's StyleX output
 * is injected before styles.css, so a same-specificity StyleX atomic class loses the cascade tie
 * to `.plain-button` for any shared property — the original compound selector (2 classes + tag)
 * has higher specificity than `.plain-button` (1 class), which StyleX can't replicate.
 */
export const styles = stylex.create({
  dialog: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  resolutionOptions: {
    display: "flex",
    gap: 8,
  },
  summaryLine: {
    margin: "0 0 4px",
    fontSize: 13,
    color: "var(--text-quaternary-soft)",
  },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
  },
});
