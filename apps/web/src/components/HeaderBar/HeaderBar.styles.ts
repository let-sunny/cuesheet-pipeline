import * as stylex from "@stylexjs/stylex";

/** Component anatomy migration (docs/styling-migration.md) — rules ported 1:1 from the old
 * `.header-row`/`.header-title-group`/`.dirty-badge`/`.save-row`/`.header-divider` classes in
 * styles.css, plus `.app h1` (the only `<h1>` in the app is this one, so despite the
 * `.app`-scoped selector it was never actually shared with another component — its
 * `font-size`/`margin` fold into `title` below alongside the narrower
 * `.header-row h1 { margin: 0; }` override that used to win the tie against it on source order).
 *
 * NOT migrated here (stays plain CSS, see styles.css): the theme toggle buttons' own look
 * (`.theme-mode-toggle button`/`:hover:not(.active)`/`.active`/`svg`). Those buttons carry the
 * `.plain-button` marker class (screen-spec rule 8), and this app's StyleX setup injects its
 * generated CSS *before* styles.css in the cascade — so at equal specificity (both are
 * single/double-class selectors, no `@layer`), styles.css's later-in-source-order `.plain-button`
 * silently wins over a same-specificity StyleX atomic class for every overlapping property
 * (background/border/color/padding all measured reverting to `.plain-button`'s values in a
 * screenshot-diff check). The original code avoided this by giving `.theme-mode-toggle button`
 * compound-selector specificity (2 classes + tag) higher than `.plain-button` (1 class) — StyleX
 * can't express that same specificity edge, so the button-level rules stay put; only the
 * `.theme-mode-toggle` wrapper's own layout (which doesn't compete with `.plain-button`) moves in.
 */
export const styles = stylex.create({
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    margin: 0,
  },
  // Hover/focus affordance so the title reads as editable without inventing a new pattern (the
  // standard Notion/Google-Docs "click straight into the text" convention) - a faint underline on
  // hover, no visible border in the resting state.
  titleEditable: {
    cursor: "text",
    borderRadius: 4,
    padding: "2px 6px",
    marginInline: -6,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: {
      default: "transparent",
      ":hover": "var(--border)",
    },
  },
  titleInput: {
    fontFamily: "inherit",
    fontWeight: "inherit",
    color: "inherit",
    backgroundColor: "var(--surface-2)",
    borderRadius: 4,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
    padding: "2px 6px",
    marginInline: -6,
    outline: "none",
  },
  titleGroup: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  dirtyBadge: {
    fontSize: 13,
    color: "var(--warning-text)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--warning-border)",
    borderRadius: 4,
    padding: "2px 8px",
  },
  saveRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  divider: {
    width: 1,
    height: 20,
    backgroundColor: "var(--border)",
  },
  themeToggle: {
    display: "flex",
    gap: 2,
    padding: 2,
    backgroundColor: "var(--surface-2)",
    borderRadius: 8,
  },
});
