import * as stylex from "@stylexjs/stylex";
import { colorVars, textSizeVars } from "@astryxdesign/core/theme/tokens.stylex";

/**
 * Component anatomy (CLAUDE.md "component layering") - see docs/research/trim-ux-conventions.md
 * section 4 for the interaction spec this renders. Longhand properties throughout
 * (backgroundColor, borderWidth/borderStyle/borderColor) per the styling-migration.md convention.
 */
export const styles = stylex.create({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  // The filmstrip surface - fixed height (~48px, screen-spec section 4.1), clips the cell
  // separators/thumbnails to its rounded corners.
  track: {
    position: "relative",
    height: 48,
    marginTop: 4,
    marginBottom: 4,
    borderRadius: 4,
    overflow: "hidden",
    cursor: "pointer",
    touchAction: "none",
    backgroundColor: colorVars["--color-background-muted"],
  },
  filmstripRow: {
    position: "absolute",
    inset: 0,
    display: "flex",
  },
  cell: {
    position: "relative",
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    height: "100%",
    overflow: "hidden",
    borderRightWidth: 1,
    borderRightStyle: "solid",
    borderRightColor: colorVars["--color-border"],
  },
  // Ruler-tick fallback (section 4.1) - shown per-cell until its thumbnail resolves, or
  // permanently if the thumbnail is unavailable.
  ruler: {
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 2,
    pointerEvents: "none",
  },
  rulerTick: {
    width: 1,
    height: 8,
    marginBottom: 2,
    backgroundColor: colorVars["--color-border"],
  },
  rulerLabel: {
    fontSize: textSizeVars["--font-size-2xs"],
    lineHeight: 1,
    color: colorVars["--color-text-secondary"],
    whiteSpace: "nowrap",
  },
  cellThumb: {
    position: "absolute",
    inset: 0,
  },
  cellThumbHidden: {
    visibility: "hidden",
  },
  // Shaded in/out range - a translucent accent tint over the filmstrip, full height so it reads
  // against real thumbnail content (section 4.1: "shaded in..out range").
  range: {
    position: "absolute",
    top: 0,
    bottom: 0,
    // rgba(91, 124, 250, 0.22) (this app's old fixed accent-blue tint) -> Astryx's own
    // accent-muted token (2026-07-11 color migration) - a translucent accent tint is exactly what
    // this token is for, and it now follows the accent color of whichever theme is active instead
    // of always rendering this app's old bespoke blue.
    backgroundColor: colorVars["--color-accent-muted"],
    pointerEvents: "none",
  },
  handle: {
    position: "absolute",
    top: 14,
    width: 12,
    height: 20,
    marginLeft: -6,
    borderRadius: 3,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colorVars["--color-accent"],
    backgroundColor: colorVars["--color-text-primary"],
    cursor: "ew-resize",
    touchAction: "none",
  },
  playhead: {
    position: "absolute",
    top: 0,
    width: 2,
    height: 48,
    marginLeft: -1,
    backgroundColor: colorVars["--color-warning"],
    pointerEvents: "none",
  },
  // Zoom control row - a small row at the strip's right end (section 4.2).
  zoomRow: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 6,
  },
  // Pan control (section 4.3) - a slim scrollbar-shaped trough, only rendered while zoomed in.
  panTrough: {
    position: "relative",
    height: 10,
    borderRadius: 5,
    cursor: "pointer",
    touchAction: "none",
    backgroundColor: colorVars["--color-background-muted"],
  },
  panCutTick: {
    position: "absolute",
    top: 2,
    bottom: 2,
    minWidth: 2,
    borderRadius: 1,
    backgroundColor: colorVars["--color-accent"],
    pointerEvents: "none",
  },
  panThumb: {
    position: "absolute",
    top: 0,
    bottom: 0,
    borderRadius: 5,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colorVars["--color-accent"],
    backgroundColor: colorVars["--color-accent-muted"],
    cursor: "grab",
    touchAction: "none",
    // A hover-darkened/lightened step on top of accent-muted, via Astryx's own `--color-tint-hover`
    // token (black in light mode, white in dark - "used with color-mix for hover states" per its
    // own doc comment) rather than a second fixed color, so the hover step still tracks whichever
    // theme/mode is active.
    ":hover": {
      backgroundColor: `color-mix(in srgb, ${colorVars["--color-accent-muted"]}, ${colorVars["--color-tint-hover"]} 12%)`,
    },
  },
  panEdge: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 6,
    cursor: "ew-resize",
    touchAction: "none",
  },
  panEdgeStart: {
    left: 0,
  },
  panEdgeEnd: {
    right: 0,
  },
});
