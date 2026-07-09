import type { ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { styles } from "./Banner.styles.js";

interface Props {
  /** The alert message. */
  children: ReactNode;
  /** Optional grouped action buttons, right-aligned and visually separated from the message
   *  (screen-spec section 6: only one primary per group). */
  actions?: ReactNode;
}

/**
 * Generic inline alert banner used at the top of the app (external-change notice, unsaved-session
 * restore prompt). Both current call sites render the plain (no color-variant) look.
 */
export function Banner({ children, actions }: Props) {
  return (
    <div {...stylex.props(styles.banner)}>
      {children}
      {actions ? <div {...stylex.props(styles.actions)}>{actions}</div> : null}
    </div>
  );
}
