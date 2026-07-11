import * as stylex from "@stylexjs/stylex";
import {
  colorVars,
  radiusVars,
  spacingVars,
  textSizeVars,
  fontWeightVars,
} from "@astryxdesign/core/theme/tokens.stylex";

/**
 * Component anatomy migration (docs/styling-migration.md, StyleX migration batch 3) — rules
 * ported 1:1 from the old `.compact-list-*`/`.bgm-gutter-*` classes in styles.css (all owned
 * solely by this component).
 *
 * NOT migrated here (stay plain CSS, see styles.css):
 * - `.scene-shot-badge` (+ `.shot-*` variants) — shared with VideoPreview.tsx (both render the
 *   same scene-info badge), so it's a shared token, not owned solely by this component.
 * - `.compact-list-subtitle-input` (+ `:focus`) — overrides `.plain-field`/`.plain-field-textarea`
 *   (border/background/border-radius/padding). Both are single-class selectors tied on
 *   specificity, and this app's StyleX output is injected *before* styles.css, so a same-
 *   specificity StyleX atomic class would lose that cascade tie to the later-in-source
 *   `.plain-field`/`.plain-field-textarea` rules for every overlapping property — styles.css's own
 *   comment on `.plain-field-textarea` documents this exact selector as the reason it's kept a
 *   bare single-class rule instead of `textarea.plain-field` in the first place.
 *
 * The BGM gutter toggle and the row action buttons (move up/down, delete) are now stock Astryx
 * Button/IconButton (2026-07-11 stock-component migration) - the old `.bgm-gutter-toggle`/
 * `.compact-list-actions button` plain-CSS exceptions are gone with them.
 *
 * `background`/`border` shorthands are written out as their longhand equivalents
 * (`backgroundColor`, `borderWidth`+`borderStyle`+`borderColor`) — see HeaderBar.styles.ts's
 * comment for why (StyleX silently drops the shorthand form). `flex` (the 3-value shorthand) is
 * likewise avoided in favor of `flexGrow`/`flexShrink`/`flexBasis` on principle, matching that same
 * caution, even though it hasn't specifically been measured dropped.
 *
 * Spacing/radius migration (2026-07-11, design-principles.md #5 strict rule, same reasoning as
 * MomentPalette.styles.ts's comment): `gap`/`padding`/`margin`/`borderRadius` read from Astryx's
 * `spacingVars`/`radiusVars`. Structural row/column sizing (`list`'s 300px column, `index`'s 20px
 * number gutter, `gutterHandle`'s 9px drag-handle thickness, `subtitleDot`'s 8px dot) and color/
 * font-size stay literal/deferred, same reasoning as before.
 */
export const styles = stylex.create({
  panel: {
    display: "flex",
    flexDirection: "column",
    gap: spacingVars["--spacing-1-5"],
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto",
    minWidth: 0,
  },
  // Section-header separation (2026-07-11 QA fix, design-principles.md #4) - a thin bottom
  // border + a little breathing room below is what keeps this compact header reading as its own
  // section instead of blending into the first cut row right underneath it (the user's actual
  // complaint was misreading the header's "+ Add track" as a cut-list action, not just its icon).
  gutterHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacingVars["--spacing-2"],
    paddingBottom: spacingVars["--spacing-1-5"],
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colorVars["--color-border"],
  },
  // Icon+text+count-badge composition passed as the gutter-toggle Button's `children` (2026-07-11
  // stock-component migration) - Button itself only lays out a single icon/label pair internally,
  // so this custom composition needs its own flex row to match the previous look.
  gutterToggleContent: {
    display: "flex",
    alignItems: "center",
    gap: spacingVars["--spacing-1"],
  },
  gutterCountBadge: {
    padding: `0 ${spacingVars["--spacing-1"]}`,
    borderRadius: radiusVars["--radius-element"],
    fontSize: textSizeVars["--font-size-xs"],
    fontWeight: fontWeightVars["--font-weight-semibold"],
    backgroundColor: colorVars["--color-background-green"],
    color: colorVars["--color-text-green"],
  },
  listBody: {
    display: "flex",
    alignItems: "flex-start",
    gap: spacingVars["--spacing-2"],
    minWidth: 0,
  },
  gutter: {
    position: "relative",
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto",
    alignSelf: "stretch",
    touchAction: "none",
  },
  gutterBar: {
    position: "absolute",
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    overflow: "hidden",
    backgroundColor: colorVars["--color-background-green"],
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colorVars["--color-border-green"],
    borderRadius: radiusVars["--radius-inner"],
    cursor: "grab",
  },
  gutterBarSelected: {
    borderColor: colorVars["--color-accent"],
    boxShadow: `0 0 0 1px ${colorVars["--color-accent"]}`,
  },
  // 6px -> 9px (2026-07-09 diagnosed drag-reliability fix) - a wider grab target for the
  // resize-start/resize-end handles, alongside the window-level pointer listeners in
  // CompactSegmentList.tsx that make the drag itself track reliably once grabbed.
  gutterHandle: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto",
    height: 9,
    cursor: "ns-resize",
    backgroundColor: colorVars["--color-border-green"],
  },
  gutterBarLabel: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "auto",
    minHeight: 0,
    overflow: "hidden",
    writingMode: "vertical-rl",
    textOrientation: "mixed",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: textSizeVars["--font-size-xs"],
    padding: `${spacingVars["--spacing-1"]} ${spacingVars["--spacing-0-5"]}`,
    pointerEvents: "none",
  },
  // 480 -> 300 (13-inch density pass, 2026-07-10): freed width is what lets the video + cut
  // settings columns sit beside this list instead of wrapping below the video (see
  // EditStep.styles.ts's trimVideoCol/trimFieldsCol and docs/screen-spec.md's baseline-viewport
  // section). The row's time/badge/actions moved off the main row onto their own `metaRow` line
  // (below) to compensate - at the old single-row layout, this narrower width would have
  // squeezed the subtitle textarea down to an unreadable sliver.
  list: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 300,
    minWidth: 0,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    gap: spacingVars["--spacing-1-5"],
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: spacingVars["--spacing-3"],
    padding: `${spacingVars["--spacing-2"]} ${spacingVars["--spacing-3"]}`,
    backgroundColor: colorVars["--color-background-surface"],
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colorVars["--color-border"],
    borderRadius: radiusVars["--radius-element"],
    cursor: "pointer",
    minWidth: 0,
  },
  rowSelected: {
    borderColor: colorVars["--color-accent"],
    backgroundColor: colorVars["--color-accent-muted"],
  },
  rowBgmDragHighlight: {
    borderColor: colorVars["--color-border-green"],
    backgroundColor: colorVars["--color-background-green"],
  },
  index: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto",
    width: 20,
    fontSize: textSizeVars["--font-size-sm"],
    color: colorVars["--color-text-secondary"],
  },
  text: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "auto",
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: spacingVars["--spacing-1"],
  },
  scene: {
    display: "flex",
    alignItems: "center",
    gap: spacingVars["--spacing-1-5"],
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: textSizeVars["--font-size-sm"],
    color: colorVars["--color-text-secondary"],
  },
  sceneEmpty: {
    fontStyle: "italic",
    color: colorVars["--color-text-disabled"],
  },
  // Second line under the scene text (13-inch density pass, 2026-07-10) - time/style badge/
  // subtitle dot/reorder+delete actions used to sit beside `text` as direct row siblings, which
  // only worked at the row's old 480px-wide list column. Stacking them onto their own line here
  // (a common two-line list-row convention - title line + metadata line, e.g. Premiere's/Resolve's
  // bin rows) is what lets `text` keep a usable width at the narrower 300px column.
  metaRow: {
    display: "flex",
    alignItems: "center",
    gap: spacingVars["--spacing-1-5"],
    marginTop: spacingVars["--spacing-0-5"],
  },
  time: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto",
    fontSize: textSizeVars["--font-size-sm"],
    color: colorVars["--color-text-secondary"],
    whiteSpace: "nowrap",
  },
  styleBadge: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto",
    padding: `1px ${spacingVars["--spacing-1"]}`,
    borderRadius: radiusVars["--radius-inner"],
    fontSize: textSizeVars["--font-size-xs"],
    fontWeight: fontWeightVars["--font-weight-semibold"],
    whiteSpace: "nowrap",
    backgroundColor: colorVars["--color-background-pink"],
    color: colorVars["--color-text-pink"],
  },
  subtitleDot: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto",
    width: 8,
    height: 8,
    borderRadius: "50%",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colorVars["--color-accent"],
    backgroundColor: "transparent",
  },
  subtitleDotFilled: {
    backgroundColor: colorVars["--color-accent"],
  },
  actions: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto",
    display: "flex",
    gap: spacingVars["--spacing-1"],
    // Pushes the reorder/delete icons to the far end of `metaRow` (2026-07-10), matching the
    // row's old right-aligned position now that they've moved off the main row.
    marginLeft: "auto",
  },
  addButton: {
    marginTop: spacingVars["--spacing-2"],
  },
});
