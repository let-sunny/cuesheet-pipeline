import * as stylex from "@stylexjs/stylex";
import {
  colorVars,
  radiusVars,
  spacingVars,
  textSizeVars,
} from "@astryxdesign/core/theme/tokens.stylex";

/**
 * Cut-settings grid migration (2026-07-11): `panel` replaces the old shared panel-shell class
 * (styles.css) - now owned solely by this component instead of a class also reused by
 * BgmSettingsPanel (which keeps its own copy in BgmSettingsPanel.styles.ts, same duplication
 * precedent as `numberInput` elsewhere). `groupBorder`/`groupLabel` mirror RangeGroup.styles.ts's
 * copies, for the Narration group kept inline here (see this file's own doc comment on why
 * Narration isn't promoted to its own group component). The Narration File field's native-select
 * chrome (`plainField`/`selectMedium`) is gone (2026-07-11 stock-input migration) - it's now a
 * stock Astryx `Selector` via the shared `ui/SelectField` adapter. `dangerZone` replaces the old
 * danger-zone class.
 *
 * `border` shorthand is written out as its longhand equivalents (`borderTopWidth`/
 * `borderTopStyle`/`borderTopColor`) - see HeaderBar.styles.ts's comment for why (StyleX silently
 * drops the shorthand form).
 */
export const styles = stylex.create({
  // Padding is set via VStack's own `paddingBlock`/`paddingInline` props (component props first,
  // per the Astryx cheat sheet's "Custom styling" rule) - only background/radius/fill need xstyle.
  // The panel is the scroll container (flexGrow 1 fills the fields column's stretched height so the
  // card reads as the same height as the scene/video beside it; overflowY auto + minHeight 0 scroll
  // the groups when a cut's fields are taller than the column). overflowX hidden guards the
  // no-horizontal-scroll rule (2026-07-11 user feedback).
  panel: {
    backgroundColor: colorVars["--color-background-surface"],
    borderRadius: radiusVars["--radius-element"],
    flexGrow: 1,
    minHeight: 0,
    overflowY: "auto",
    overflowX: "hidden",
  },
  // The Cut/Effects tabs stay pinned to the top of the panel while the groups scroll under them, so
  // switching tabs never requires scrolling back up (2026-07-11 user feedback). It carries the
  // surface background and spans the panel's inline padding (negative margin + matching padding) so
  // scrolled content doesn't show through beside it, and sits flush to the panel's top padding edge
  // when stuck. The negative top margin + matching padding pull it up over the panel's own top
  // padding so there's no dead gap above the tabs before scrolling.
  tabBar: {
    position: "sticky",
    top: 0,
    zIndex: 1,
    backgroundColor: colorVars["--color-background-surface"],
    marginInline: `calc(-1 * ${spacingVars["--spacing-4"]})`,
    paddingInline: spacingVars["--spacing-4"],
    marginTop: `calc(-1 * ${spacingVars["--spacing-3"]})`,
    paddingTop: spacingVars["--spacing-3"],
    paddingBottom: spacingVars["--spacing-1"],
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
  narrationEmptyNote: {
    margin: `${spacingVars["--spacing-1"]} 0 0`,
    fontSize: textSizeVars["--font-size-sm"],
    color: colorVars["--color-text-secondary"],
  },
  narrationWarning: {
    margin: `${spacingVars["--spacing-1"]} 0 0`,
    fontSize: textSizeVars["--font-size-sm"],
    color: colorVars["--color-warning"],
  },
  narrationPreview: {
    paddingTop: spacingVars["--spacing-2"],
    borderTopWidth: 1,
    borderTopStyle: "dashed",
    borderTopColor: colorVars["--color-border-emphasized"],
  },
  narrationAudio: {
    width: "100%",
    height: 32,
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
});
