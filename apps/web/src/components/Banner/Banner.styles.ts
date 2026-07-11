import * as stylex from "@stylexjs/stylex";
import { textSizeVars } from "@astryxdesign/core/theme/tokens.stylex";

/**
 * Component anatomy migration (docs/styling-migration.md, StyleX migration batch 4) — ported 1:1
 * from the old `.banner`/`.banner-actions` classes in styles.css. The color-variant rules
 * (`.banner.success`/`.banner.error`/`.banner.error ul`/`.banner.error pre`) were NOT migrated —
 * repo-wide grep found no call site ever applying those modifier classes (App.tsx's two banners
 * both render the plain look), so they were dead and deleted rather than ported.
 */
export const styles = stylex.create({
  banner: {
    padding: "12px 16px",
    backgroundColor: "var(--surface-2)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border-dashed)",
    borderRadius: 6,
    marginBottom: 16,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    fontSize: textSizeVars["--font-size-sm"],
  },
  actions: {
    display: "flex",
    flexShrink: 0,
    gap: 8,
  },
});
