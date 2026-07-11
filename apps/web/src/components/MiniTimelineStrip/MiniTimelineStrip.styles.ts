import * as stylex from "@stylexjs/stylex";
import { textSizeVars } from "@astryxdesign/core/theme/tokens.stylex";

/**
 * Component anatomy migration (docs/styling-migration.md, StyleX migration batch 5) — rules ported
 * 1:1 from the old `.mini-strip*` classes in styles.css (all owned solely by this component).
 *
 * NOT migrated here (stay plain CSS, see styles.css):
 * - `.mini-strip-block` (+ `.selected`/`.clip-boundary`) — each block is a raw `<button>` that also
 *   carries the `.plain-button` marker class, and overrides several of `.plain-button`'s own
 *   properties (background/border/border-radius/padding) at equal (single-class) specificity. This
 *   app's StyleX output is injected *before* styles.css, so a same-specificity StyleX atomic class
 *   would lose that cascade tie to the later-in-source `.plain-button` rule for every overlapping
 *   property — same root cause as HeaderBar's theme toggle / BgmSettingsPanel's bgm-file-play/name.
 *
 * The zoom-controls buttons (2026-07-11 typography/stock-component pass) are now stock Astryx
 * Button/IconButton instead of raw `.plain-button` elements - the old `.mini-strip-zoom-controls
 * button` plain-CSS exception (a descendant selector StyleX couldn't express) is gone with them,
 * and `zoomControls` below no longer needs to double as a plain-CSS marker class.
 *
 * `background`/`border` shorthands are written out as their longhand equivalents — see
 * HeaderBar.styles.ts's comment for why (StyleX silently drops the shorthand form).
 */
export const styles = stylex.create({
  root: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "auto",
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    backgroundColor: "var(--surface-1)",
    borderRadius: 8,
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
    gap: 2,
    minWidth: 0,
  },
  zoomControls: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto",
    display: "flex",
    gap: 4,
  },
  total: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto",
    fontSize: textSizeVars["--font-size-sm"],
    color: "var(--text-tertiary)",
  },
  // Positions the SegmentThumb inside a block, filling it (no conflict with SegmentThumb's own
  // base style, which sets neither position nor inset, so this migrates cleanly despite being
  // consumer-supplied - see SegmentThumb.styles.ts's comment on why consumer classNames stay a
  // plain string concatenation).
  thumb: {
    position: "absolute",
    inset: 0,
  },
});
