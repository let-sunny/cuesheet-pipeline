import * as stylex from "@stylexjs/stylex";
import { textSizeVars } from "@astryxdesign/core/theme/tokens.stylex";

/** Component anatomy migration (docs/styling-migration.md) — rules ported 1:1 from the old
 * `.keyboard-help*` classes in styles.css.
 *
 * `background`/`border`/`font` shorthands are written out as their longhand equivalents
 * (`backgroundColor`, `borderWidth`+`borderStyle`+`borderColor`, `fontFamily`) throughout - a
 * screenshot-diff check found this StyleX setup silently drops the shorthand form (computed
 * background stayed transparent, border-width stayed 0) while the longhand form compiles and
 * applies correctly. See HeaderBar.styles.ts for the same fix. */
export const styles = stylex.create({
  panel: {
    position: "fixed",
    right: 16,
    bottom: 16,
    zIndex: 10,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 6,
  },
  toggle: {
    fontSize: textSizeVars["--font-size-sm"],
  },
  note: {
    margin: 0,
    padding: "8px 12px",
    backgroundColor: "var(--surface-1)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
    borderRadius: 6,
    fontSize: textSizeVars["--font-size-sm"],
    color: "var(--text-tertiary)",
    maxWidth: 280,
  },
  list: {
    listStyle: "none",
    margin: 0,
    padding: "10px 12px",
    backgroundColor: "var(--surface-1)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
    borderRadius: 6,
    fontSize: textSizeVars["--font-size-sm"],
    maxWidth: 280,
  },
  listItem: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    padding: "3px 0",
  },
  kbd: {
    fontFamily: "inherit",
    color: "var(--text-quaternary)",
    backgroundColor: "var(--surface-2)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
    borderRadius: 3,
    padding: "1px 5px",
    whiteSpace: "nowrap",
  },
});
