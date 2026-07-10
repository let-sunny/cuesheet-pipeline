import * as stylex from "@stylexjs/stylex";

// Reminder: StyleX silently drops shorthand properties - write `background`/`border` out as their
// longhand equivalents (`backgroundColor`, `borderWidth` + `borderStyle` + `borderColor`), and
// `flex` as `flexGrow` + `flexShrink` + `flexBasis`. See HeaderBar.styles.ts for the full writeup.
export const styles = stylex.create({
  root: {},
});
