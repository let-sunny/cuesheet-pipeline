import * as stylex from "@stylexjs/stylex";

/** Owned solely by RangeGroup - see SegmentQuickFields.styles.ts's doc comment for the shared
 * `.qf-*`/`.field-*` tokens this group also relies on (those stay in styles.css). */
export const styles = stylex.create({
  readonlyValue: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "auto",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: 13,
    color: "var(--text-primary)",
  },
  // Length readout's error treatment when in >= out (rangeError set) - same "error" color token
  // IntroOutroEditor/MomentPalette already use for their own inline validation notes.
  lengthErrorText: {
    color: "var(--error-text)",
    fontWeight: 600,
  },
  rangeError: {
    margin: "4px 0 0",
    fontSize: 12,
    color: "var(--error-text)",
  },
});
