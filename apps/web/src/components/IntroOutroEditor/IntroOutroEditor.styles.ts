import * as stylex from "@stylexjs/stylex";
import { colorVars, textSizeVars } from "@astryxdesign/core/theme/tokens.stylex";

/**
 * Component anatomy migration (docs/styling-migration.md) — rules ported 1:1 from the old
 * `.intro-outro-*` classes in styles.css (all owned solely by this component). The outer 2-up
 * layout (formerly a hand-rolled `editor` flex row here) is now Astryx's `Grid` (Finish/Export
 * step Astryx-catalog rebuild) - `.settings-group`/`.settings-field`/`.wide-input`/`.plain-field`
 * are also gone from this component's own markup, but stay in styles.css since several other,
 * not-yet-migrated components still use them. `.narration-empty-note`/`.empty` (shared with
 * BgmSettingsPanel/SegmentQuickFields and other empty-state messages, respectively) are also left
 * behind for the same reason.
 *
 * `background`/`border` shorthands are written out as their longhand equivalents
 * (`backgroundColor`, `borderWidth`+`borderStyle`+`borderColor`) — see HeaderBar.styles.ts's
 * comment for why (StyleX silently drops the shorthand form).
 */
export const styles = stylex.create({
  current: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
    fontSize: textSizeVars["--font-size-sm"],
    color: colorVars["--color-text-primary"],
  },
  clipName: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  missing: {
    marginTop: 10,
  },
  preview: {
    width: "100%",
    maxWidth: 360,
    marginTop: 10,
    borderRadius: 4,
    backgroundColor: "black",
    display: "block",
  },
  dropzone: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 8,
    padding: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colorVars["--color-border-emphasized"],
    borderRadius: 4,
  },
  dropzoneActive: {
    borderColor: colorVars["--color-accent"],
    backgroundColor: colorVars["--color-accent-muted"],
  },
  fileInput: {
    display: "none",
  },
  dropzoneHint: {
    margin: 0,
    fontSize: textSizeVars["--font-size-sm"],
    color: colorVars["--color-text-secondary"],
  },
  uploadError: {
    flexBasis: "100%",
    margin: 0,
    fontSize: textSizeVars["--font-size-sm"],
    color: colorVars["--color-text-red"],
  },
});
