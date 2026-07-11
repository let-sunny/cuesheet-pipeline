import * as stylex from "@stylexjs/stylex";
import {
  colorVars,
  radiusVars,
  spacingVars,
  textSizeVars,
} from "@astryxdesign/core/theme/tokens.stylex";

/**
 * Component anatomy migration (docs/styling-migration.md, StyleX migration batch 5) — rules ported
 * 1:1 from the old `.mini-strip*` classes in styles.css (all owned solely by this component).
 *
 * `.mini-strip-block` (+ `.selected`/`.clip-boundary`) is gone from styles.css too (2026-07-11
 * stock-audit completion pass) - folded into `block`/`blockSelected`/`blockClipBoundary` below,
 * combining what used to be the `.plain-button` base look (this block is a raw `<button>` with no
 * Astryx Button equivalent - a variable-width flex-grow timeline scrubber block holding a thumbnail
 * image, not a labeled action button; CLAUDE.md's "domain-custom areas ... keep their own CSS"
 * carve-out) with `.mini-strip-block`'s own overrides. Both now live in one StyleX object instead
 * of two same-specificity global classes racing on cascade order, so there's no more cascade-tie
 * concern to document (`.plain-button` no longer exists at all).
 *
 * The zoom-controls buttons (2026-07-11 typography/stock-component pass) are now stock Astryx
 * Button/IconButton instead of raw `.plain-button` elements - the old `.mini-strip-zoom-controls
 * button` plain-CSS exception (a descendant selector StyleX couldn't express) is gone with them,
 * and `zoomControls` below no longer needs to double as a plain-CSS marker class.
 *
 * `background`/`border` shorthands are written out as their longhand equivalents — see
 * HeaderBar.styles.ts's comment for why (StyleX silently drops the shorthand form).
 *
 * Radius/spacing migration (2026-07-11, design-principles.md #5 strict rule): `gap`/`padding`/
 * `margin`/`borderRadius` read from Astryx's `spacingVars`/`radiusVars`, snapped to the nearest
 * step where a value fell between two (10 -> 8, ties round down per the existing repo convention -
 * see MomentPalette.styles.ts's own comment). `root` (the timeline box) gets `--radius-container`
 * per the task's explicit large-surface mapping; the per-block filmstrip cells get the smaller
 * `--radius-element`. Structural sizing (`height`, `minWidth: 0`) stays literal.
 */
export const styles = stylex.create({
  root: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "auto",
    display: "flex",
    alignItems: "center",
    gap: spacingVars["--spacing-2"],
    padding: `${spacingVars["--spacing-2"]} ${spacingVars["--spacing-3"]}`,
    backgroundColor: colorVars["--color-background-surface"],
    borderRadius: radiusVars["--radius-container"],
    minWidth: 0,
  },
  // When zoomed in, the track becomes wider than the viewport, causing horizontal scroll.
  viewport: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "auto",
    display: "flex",
    minWidth: 0,
    overflowX: "auto",
  },
  track: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "auto",
    display: "flex",
    gap: spacingVars["--spacing-0-5"],
    minWidth: 0,
  },
  zoomControls: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto",
    display: "flex",
    gap: spacingVars["--spacing-1"],
  },
  total: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto",
    fontSize: textSizeVars["--font-size-sm"],
    color: colorVars["--color-text-secondary"],
  },
  // Positions the SegmentThumb inside a block, filling it (no conflict with SegmentThumb's own
  // base style, which sets neither position nor inset, so this migrates cleanly despite being
  // consumer-supplied - see SegmentThumb.styles.ts's comment on why consumer classNames stay a
  // plain string concatenation).
  thumb: {
    position: "absolute",
    inset: 0,
  },
  // Background is intentionally fixed dark regardless of theme — since this is a timeline canvas
  // that holds a video frame thumbnail, it stays dark even in light theme (same reasoning as
  // SubtitleStyleSettings.styles.ts's preview stage - see `--stage-bg`'s own doc comment in
  // styles.css for why it's a literal, not an Astryx `--color-*` token).
  block: {
    position: "relative",
    height: 20,
    padding: 0,
    overflow: "hidden",
    fontFamily: "inherit",
    color: "inherit",
    backgroundColor: "var(--stage-bg)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colorVars["--color-border"],
    borderRadius: radiusVars["--radius-element"],
    cursor: "pointer",
  },
  // Adds a thin divider so clip boundaries stand out even in the zoomed-out (full view) state.
  blockClipBoundary: {
    borderLeftWidth: 2,
    borderLeftColor: colorVars["--color-accent"],
  },
  blockSelected: {
    borderColor: colorVars["--color-accent"],
    backgroundColor: colorVars["--color-accent-muted"],
  },
});
