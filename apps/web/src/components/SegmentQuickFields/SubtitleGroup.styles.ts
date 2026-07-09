import * as stylex from "@stylexjs/stylex";

/** Owned solely by SubtitleGroup. `.qf-subtitle-field textarea`'s one property (`resize:
 * vertical`) is applied directly to the textarea itself (this component owns that element
 * directly in JSX, so there's no need for the old descendant selector). */
export const styles = stylex.create({
  subtitleTextarea: {
    resize: "vertical",
  },
});
