import * as stylex from "@stylexjs/stylex";

// Reminder: StyleX silently drops shorthand properties - write `background`/`border` out as their
// longhand equivalents (`backgroundColor`, `borderWidth` + `borderStyle` + `borderColor`), and
// `flex` as `flexGrow` + `flexShrink` + `flexBasis`. See HeaderBar.styles.ts for the full writeup.
export const styles = stylex.create({
  // Fills whatever box TitleOverlay's stage gives this component - the inner canvas div (sized to
  // the project's native pixel dimensions, then CSS-scaled to fit) is positioned absolutely
  // within this via computeTitleStageTransform's offsets.
  viewport: {
    position: "absolute",
    inset: 0,
    overflow: "hidden",
  },
});
