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
 * ported 1:1 from the old `.compact-list-*` classes in styles.css (all owned solely by this
 * component). BGM gutter/bar styles moved to `BgmSidePanel.styles.ts` alongside the BGM gutter
 * itself (2026-07-12 relocation) - `rowBgmDragHighlight` stays here since it styles a cut row.
 *
 * `.scene-shot-badge` (+ `.shot-*` variants) is gone from styles.css (2026-07-11 stock-audit
 * completion pass) - replaced by a stock Astryx `Badge` (`sceneBadge` below trims its default size,
 * same override as VideoPreview.styles.ts's own `sceneBadge`), colored via
 * `shotTypeBadgeVariant` (lib/momentCards.ts) / `categoryBadgeVariant` (lib/domainConfig.ts) - the
 * same category-color mapping the Scenes palette already uses, not a second color system. `.compact-list-subtitle-
 * input` (+ `:focus`) is gone too - ported 1:1 into `subtitleInput` below (StyleX's own cascade
 * layer no longer needs to out-order a global plain-input marker class, since it's gone from this
 * component's markup).
 *
 * The row action buttons (move up/down, delete) are now stock Astryx IconButton (2026-07-11
 * stock-component migration) - the old `.compact-list-actions button` plain-CSS exception is gone
 * with them.
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
 * number gutter, `subtitleDot`'s 8px dot) and color/font-size stay literal/deferred, same
 * reasoning as before.
 */
export const styles = stylex.create({
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
  // Badge has no `size` prop - trims its default padding/font-size down to fit inline in `scene`
  // (same override as VideoPreview.styles.ts's own `sceneBadge` - the two intentionally match,
  // since it's the same badge shown in the Edit step's context header and this cut-list row).
  sceneBadge: {
    fontSize: textSizeVars["--font-size-xs"],
    padding: `1px ${spacingVars["--spacing-1-5"]}`,
  },
  // Ported 1:1 from the old `.compact-list-subtitle-input`(+`:focus`) rule in styles.css - a fixed
  // 2-line-height inline quick-edit textarea (see the call site's comment for why it doesn't grow
  // with content).
  subtitleInput: {
    width: "100%",
    minWidth: 0,
    boxSizing: "border-box",
    padding: "3px 6px",
    fontSize: textSizeVars["--font-size-base"],
    fontFamily: "inherit",
    lineHeight: "18px",
    height: 44,
    color: "inherit",
    backgroundColor: colorVars["--color-background-surface"],
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colorVars["--color-border"],
    borderRadius: radiusVars["--radius-inner"],
    resize: "none",
    overflowY: "auto",
    ":focus": {
      outline: "none",
      borderColor: colorVars["--color-accent"],
    },
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
  // A small amber "todo" dot marking a cut that has no subtitle yet (only rendered in that state -
  // see CompactSegmentList.tsx). Uses the yellow BACKGROUND/BORDER container tokens (the same pair
  // the category Badges use), not `--color-warning` ink: the ink token is a dark olive/mustard in
  // the Stone/Neutral light themes, so a filled dot with it read as a muddy near-black blob and lost
  // the amber affordance (theme audit 2026-07-11). The container pair stays amber-family across all
  // three themes. Amber, not red: a missing subtitle is a to-do, not an error.
  subtitleDot: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto",
    width: 8,
    height: 8,
    borderRadius: "50%",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colorVars["--color-border-yellow"],
    backgroundColor: colorVars["--color-background-yellow"],
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
});
