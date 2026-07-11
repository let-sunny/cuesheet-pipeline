import * as stylex from "@stylexjs/stylex";
import { colorVars, radiusVars, spacingVars, textSizeVars } from "@astryxdesign/core/theme/tokens.stylex";

/**
 * Component anatomy migration (docs/styling-migration.md) — rules ported 1:1 from the old
 * `.bgm-file-*` classes in styles.css.
 *
 * The file preview/select buttons are now stock Astryx IconButton/Button (2026-07-11 stock-
 * component migration) - the old `.bgm-file-play`/`.bgm-file-name`/`.bgm-file-row.selected
 * .bgm-file-name` plain-CSS exceptions are gone with them; `fileNameButton` below is this file's
 * own xstyle for the file-name button's left-aligned, flex-growing layout.
 *
 * Spacing migration (2026-07-11, design-principles.md #5 strict rule, same reasoning as
 * MomentPalette.styles.ts's comment): `gap` reads from Astryx's `spacingVars`. `maxHeight: 220`
 * (the scrollable file list's own height budget) stays literal - structural sizing, not spacing.
 *
 * `panel`/`panelTitle`/`groupBorder`/`groupLabel`/`readonlyText`/`dangerZone` (2026-07-11 Cut-
 * settings grid migration) replace the old shared panel-shell/panel-title/group/group-label/
 * readonly-text/danger-zone classes - this panel keeps its own copy rather than importing
 * SegmentQuickFields's (the two panels sit side by side as siblings in the Edit step but are
 * otherwise independent components). Start/End/Volume's native-input chrome (`plainField`/
 * `inputNarrow`) is gone (2026-07-11 stock-input migration) - they're now a stock Astryx
 * `TextInput` via the shared `ui/NumericInput` adapter. `border` shorthand is written out as its
 * longhand equivalents - see HeaderBar.styles.ts's comment for why (StyleX silently drops the
 * shorthand form).
 */
export const styles = stylex.create({
  // flexGrow 1 + minHeight 0 + overflowY auto: fill the fields column's stretched height (same as
  // the cut-settings panel) so the card matches the video column's height instead of ending at its
  // own content, and scroll inside when taller than the column.
  panel: {
    backgroundColor: colorVars["--color-background-surface"],
    borderRadius: radiusVars["--radius-element"],
    flexGrow: 1,
    minHeight: 0,
    overflowY: "auto",
    overflowX: "hidden",
  },
  panelTitle: {
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  groupBorder: {
    paddingTop: spacingVars["--spacing-2"],
    borderTopWidth: 1,
    borderTopStyle: "dashed",
    borderTopColor: colorVars["--color-border-emphasized"],
  },
  groupLabel: {
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  readonlyText: {
    fontSize: textSizeVars["--font-size-sm"],
    color: colorVars["--color-text-secondary"],
  },
  emptyNote: {
    margin: `${spacingVars["--spacing-1"]} 0 0`,
    fontSize: textSizeVars["--font-size-sm"],
    color: colorVars["--color-text-secondary"],
  },
  // --color-border-red used as a danger-zone top border - a border-tuned tint, not status text;
  // left as-is per the semantic-token pass (see HeaderBar.styles.ts's raw-vs-semantic comment).
  dangerZone: {
    marginTop: spacingVars["--spacing-3"],
    paddingTop: spacingVars["--spacing-2"],
    borderTopWidth: 1,
    borderTopStyle: "dashed",
    borderTopColor: colorVars["--color-border-red"],
  },
  fileList: {
    display: "flex",
    flexDirection: "column",
    gap: spacingVars["--spacing-0-5"],
    maxHeight: 220,
    overflowY: "auto",
  },
  fileRow: {
    display: "flex",
    alignItems: "center",
    gap: spacingVars["--spacing-1-5"],
  },
  // Left-aligns the file name (a Button centers its label by default) and lets it grow to fill
  // the row, matching the row's previous flex:1 1 auto layout.
  fileNameButton: {
    flexGrow: 1,
    minWidth: 0,
    justifyContent: "flex-start",
  },
});
