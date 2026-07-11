import * as stylex from "@stylexjs/stylex";
import {
  colorVars,
  radiusVars,
  spacingVars,
  textSizeVars,
} from "@astryxdesign/core/theme/tokens.stylex";

/**
 * Component anatomy migration (docs/styling-migration.md) — rules ported 1:1 from the old
 * `.intro-outro-*` classes in styles.css (all owned solely by this component). The outer 2-up
 * layout (formerly a hand-rolled `editor` flex row here) is now Astryx's `Grid` (Finish/Export
 * step Astryx-catalog rebuild).
 *
 * 2026-07-11 stock-audit completion pass: the old shared plain-input marker class is gone from
 * this component (`select` below ports its look 1:1 for the two "Choose file" `<select>`s, kept
 * native - see the file's own comment on why Astryx `Selector` doesn't fit here). `.empty` (the
 * "can't find the source" message, shared with VideoPreview.tsx) is gone too - `missing` below
 * folds its 2 properties in directly (duplicated identically in VideoPreview.styles.ts's own
 * `missing`, rather than kept as a shared global class for a 2-property rule). `grid` adds the
 * `minmax(0, 1fr)` track-template override that fixes this section's horizontal overflow (see the
 * Grid call site's comment). The empty-state note previously shared with BgmSettingsPanel/
 * SegmentQuickFields moved to each of those components' own styling in the 2026-07-11 Cut-settings-
 * grid migration - out of scope here (this component never referenced it).
 *
 * `background`/`border` shorthands are written out as their longhand equivalents
 * (`backgroundColor`, `borderWidth`+`borderStyle`+`borderColor`) — see HeaderBar.styles.ts's
 * comment for why (StyleX silently drops the shorthand form).
 *
 * Radius/spacing migration (2026-07-11, design-principles.md #5 strict rule): `gap`/`padding`/
 * `margin`/`borderRadius` read from Astryx's `spacingVars`/`radiusVars`, snapped to the nearest
 * step where a value fell between two (10 -> 8, ties round down per the existing repo convention -
 * see MomentPalette.styles.ts's own comment). `select`/`preview`/`dropzone` are all input-sized
 * boxes, so they get `--radius-element`. Structural sizing (`maxWidth: 360`) stays literal.
 */
export const styles = stylex.create({
  grid: {
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  },
  current: {
    display: "flex",
    alignItems: "center",
    gap: spacingVars["--spacing-2"],
    marginBottom: spacingVars["--spacing-2"],
    fontSize: textSizeVars["--font-size-sm"],
    color: colorVars["--color-text-primary"],
  },
  clipName: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  missing: {
    marginTop: spacingVars["--spacing-2"],
    color: colorVars["--color-text-secondary"],
    fontSize: textSizeVars["--font-size-sm"],
  },
  preview: {
    width: "100%",
    maxWidth: 360,
    marginTop: spacingVars["--spacing-2"],
    borderRadius: radiusVars["--radius-element"],
    backgroundColor: "black",
    display: "block",
  },
  dropzone: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacingVars["--spacing-2"],
    marginTop: spacingVars["--spacing-2"],
    padding: spacingVars["--spacing-2"],
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colorVars["--color-border-emphasized"],
    borderRadius: radiusVars["--radius-element"],
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
    color: colorVars["--color-error"],
  },
});
