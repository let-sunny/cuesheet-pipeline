import * as stylex from "@stylexjs/stylex";
import { radiusVars, spacingVars, textSizeVars } from "@astryxdesign/core/theme/tokens.stylex";

/** Component anatomy migration (docs/styling-migration.md) — rules ported 1:1 from the old
 * `.header-row`/`.header-title-group`/`.dirty-badge`/`.save-row`/`.header-divider` classes in
 * styles.css, plus `.app h1` (the only `<h1>` in the app is this one, so despite the
 * `.app`-scoped selector it was never actually shared with another component — its
 * `font-size`/`margin` fold into `title` below alongside the narrower
 * `.header-row h1 { margin: 0; }` override that used to win the tie against it on source order).
 *
 * The theme toggle (2026-07-11 stock-component migration) is now a stock Astryx
 * `SegmentedControl`/`SegmentedControlItem` pair instead of raw `.plain-button` elements - it owns
 * its own look entirely via Astryx's theme tokens, so there's no wrapper style left to own here
 * (the old `themeToggle` xstyle/`.theme-mode-toggle` plain-CSS block was deleted along with it).
 *
 * Spacing/radius migration (2026-07-11, design-principles.md #5 strict rule): every `gap`/
 * `padding`/`margin`/`borderRadius` below now reads from Astryx's `spacingVars`/`radiusVars`
 * (`@astryxdesign/core/theme`) instead of a literal px number, so re-spacing follows the theme the
 * same way recoloring does (negative margins go through `calc(-1 * token)` rather than a literal).
 * Colors here still reference this app's own bespoke `var(--...)` tokens (not Astryx's
 * `colorVars`) - see styles.css's top-of-file comment for why that swap is deliberately deferred
 * rather than rushed.
 */
export const styles = stylex.create({
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacingVars["--spacing-4"],
  },
  // 20 -> lg (2026-07-11 typography pass, design-principles.md #6 "dense, 13-inch") - still the
  // single biggest text on the page (the app's only h1), just a denser top of the scale than the
  // old literal 20px.
  title: {
    fontSize: textSizeVars["--font-size-lg"],
    margin: 0,
  },
  // Hover/focus affordance so the title reads as editable without inventing a new pattern (the
  // standard Notion/Google-Docs "click straight into the text" convention) - a faint underline on
  // hover, no visible border in the resting state.
  titleEditable: {
    cursor: "text",
    borderRadius: radiusVars["--radius-inner"],
    padding: `${spacingVars["--spacing-0-5"]} ${spacingVars["--spacing-1-5"]}`,
    // Negative offset compensating for this element's own horizontal padding, so the text still
    // lines up flush with the title-less resting state - expressed as calc(-1 * token) rather
    // than a literal, so it still tracks the same spacing scale.
    marginInline: `calc(-1 * ${spacingVars["--spacing-1-5"]})`,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: {
      default: "transparent",
      ":hover": "var(--border)",
    },
  },
  titleInput: {
    fontFamily: "inherit",
    fontWeight: "inherit",
    color: "inherit",
    backgroundColor: "var(--surface-2)",
    borderRadius: radiusVars["--radius-inner"],
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
    padding: `${spacingVars["--spacing-0-5"]} ${spacingVars["--spacing-1-5"]}`,
    marginInline: `calc(-1 * ${spacingVars["--spacing-1-5"]})`,
    outline: "none",
  },
  titleGroup: {
    display: "flex",
    alignItems: "center",
    gap: spacingVars["--spacing-3"],
  },
  dirtyBadge: {
    fontSize: textSizeVars["--font-size-sm"],
    color: "var(--warning-text)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--warning-border)",
    borderRadius: radiusVars["--radius-inner"],
    padding: `${spacingVars["--spacing-0-5"]} ${spacingVars["--spacing-2"]}`,
  },
  saveRow: {
    display: "flex",
    alignItems: "center",
    gap: spacingVars["--spacing-3"],
  },
  divider: {
    width: 1,
    height: spacingVars["--spacing-5"],
    backgroundColor: "var(--border)",
  },
});
