import * as stylex from "@stylexjs/stylex";
import { colorVars, textSizeVars } from "@astryxdesign/core/theme/tokens.stylex";

/**
 * Component anatomy migration (docs/styling-migration.md) — rules ported 1:1 from the old
 * `.intro-outro-*` classes in styles.css (all owned solely by this component). The outer 2-up
 * layout (formerly a hand-rolled `editor` flex row here) is now Astryx's `Grid` (Finish/Export
 * step Astryx-catalog rebuild).
 *
 * 2026-07-11 stock-audit completion pass: `.plain-field` is gone from this component (`select`
 * below ports its look 1:1 for the two "Choose file" `<select>`s, kept native - see the file's own
 * comment on why Astryx `Selector` doesn't fit here). `.empty` (the "can't find the source"
 * message, shared with VideoPreview.tsx) is gone too - `missing` below folds its 2 properties in
 * directly (duplicated identically in VideoPreview.styles.ts's own `missing`, rather than kept as a
 * shared global class for a 2-property rule). `grid` adds the `minmax(0, 1fr)` track-template
 * override that fixes this section's horizontal overflow (see the Grid call site's comment).
 * `.narration-empty-note` (shared with BgmSettingsPanel/SegmentQuickFields) stays in styles.css -
 * out of scope for this pass (deferred cut-settings/BGM territory).
 *
 * `background`/`border` shorthands are written out as their longhand equivalents
 * (`backgroundColor`, `borderWidth`+`borderStyle`+`borderColor`) — see HeaderBar.styles.ts's
 * comment for why (StyleX silently drops the shorthand form).
 */
export const styles = stylex.create({
  grid: {
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  },
  select: {
    font: "inherit",
    color: "inherit",
    backgroundColor: colorVars["--color-background-surface"],
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colorVars["--color-border"],
    borderRadius: 4,
    padding: "4px 8px",
    width: "100%",
    boxSizing: "border-box",
    minWidth: 0,
  },
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
    color: colorVars["--color-text-secondary"],
    fontSize: textSizeVars["--font-size-sm"],
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
