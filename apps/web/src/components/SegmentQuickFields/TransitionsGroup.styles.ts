import * as stylex from "@stylexjs/stylex";

/** Owned solely by TransitionsGroup. */
export const styles = stylex.create({
  transition: {
    marginBottom: 10,
  },
  noteNeutral: {
    margin: "4px 0 0",
    fontSize: 12,
    color: "var(--text-secondary)",
  },
  noteWarning: {
    margin: "4px 0 0",
    fontSize: 12,
    color: "var(--warning-text)",
  },
});
