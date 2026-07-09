import * as stylex from "@stylexjs/stylex";

/**
 * Component anatomy migration (docs/styling-migration.md) — rules ported 1:1 from the old
 * `.intro-outro-*` classes in styles.css (all owned solely by this component). Left behind in
 * styles.css (not migrated): `.settings-group`/`.settings-field`/`.wide-input`/`.plain-field`
 * (shared width-token/marker classes used by several not-yet-migrated components) and
 * `.narration-empty-note`/`.empty` (shared with BgmSettingsPanel/SegmentQuickFields and other
 * empty-state messages, respectively).
 *
 * `background`/`border` shorthands are written out as their longhand equivalents
 * (`backgroundColor`, `borderWidth`+`borderStyle`+`borderColor`) — see HeaderBar.styles.ts's
 * comment for why (StyleX silently drops the shorthand form).
 */
export const styles = stylex.create({
  editor: {
    display: "flex",
    gap: 24,
    flexWrap: "wrap",
  },
  current: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
    fontSize: 13,
    color: "var(--text-quaternary)",
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
    borderColor: "var(--border-dashed)",
    borderRadius: 4,
  },
  dropzoneActive: {
    borderColor: "var(--accent)",
    backgroundColor: "var(--surface-3-soft)",
  },
  fileInput: {
    display: "none",
  },
  dropzoneHint: {
    margin: 0,
    fontSize: 12,
    color: "var(--text-tertiary)",
  },
  uploadError: {
    flexBasis: "100%",
    margin: 0,
    fontSize: 12,
    color: "var(--error-text)",
  },
});
