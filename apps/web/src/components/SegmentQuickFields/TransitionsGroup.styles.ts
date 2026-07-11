import * as stylex from "@stylexjs/stylex";
import { textSizeVars } from "@astryxdesign/core/theme/tokens.stylex";

/** Owned solely by TransitionsGroup. */
export const styles = stylex.create({
  transition: {
    marginBottom: 10,
  },
  noteNeutral: {
    margin: "4px 0 0",
    fontSize: textSizeVars["--font-size-sm"],
    color: "var(--text-secondary)",
  },
  noteWarning: {
    margin: "4px 0 0",
    fontSize: textSizeVars["--font-size-sm"],
    color: "var(--warning-text)",
  },
});
