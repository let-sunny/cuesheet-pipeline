import * as stylex from "@stylexjs/stylex";
import { spacingVars } from "@astryxdesign/core/theme/tokens.stylex";

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
 */
export const styles = stylex.create({
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
