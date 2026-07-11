import * as stylex from "@stylexjs/stylex";
import {
  colorVars,
  radiusVars,
  spacingVars,
  textSizeVars,
} from "@astryxdesign/core/theme/tokens.stylex";

/**
 * Component anatomy (CLAUDE.md "component layering") - see docs/research/trim-ux-conventions.md
 * section 4 for the interaction spec this renders. Longhand properties throughout
 * (backgroundColor, borderWidth/borderStyle/borderColor) per the styling-migration.md convention.
 *
 * Radius/spacing migration (2026-07-11, design-principles.md #5 strict rule): `gap`/`margin`/
 * `padding`/`borderRadius` read from Astryx's `spacingVars`/`radiusVars` - every corner here is a
 * trim-strip part, so all get `--radius-element`. Structural sizing/positioning (`height`, `top`,
 * the handle/playhead centering offsets derived directly from their own width/height) stays
 * literal - those are geometry, not spacing between elements.
 */
export const styles = stylex.create({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: spacingVars["--spacing-1"],
  },
  // The filmstrip surface - fixed height (~48px, screen-spec section 4.1), clips the cell
  // separators/thumbnails to its rounded corners.
  track: {
    position: "relative",
    height: 48,
    marginTop: spacingVars["--spacing-1"],
    marginBottom: spacingVars["--spacing-1"],
    borderRadius: radiusVars["--radius-element"],
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
    paddingBottom: spacingVars["--spacing-0-5"],
    pointerEvents: "none",
  },
  rulerTick: {
    width: 1,
    height: 8,
    marginBottom: spacingVars["--spacing-0-5"],
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
  // against real thumbnail content (section 4.1: "shaded in..out range"). A solid 2px accent border
  // frames the selected window (2026-07-11 visibility fix): the muted-tint fill alone was too faint
  // to read against real (often busy/light) thumbnail frames - the user reported it looked like
  // nothing was there. The border gives the draggable window a hard, always-visible outline
  // regardless of the frame content behind it, matching how video-trim tools (Premiere/CapCut)
  // bound the kept range.
  range: {
    position: "absolute",
    top: 0,
    bottom: 0,
    backgroundColor: colorVars["--color-accent-muted"],
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: colorVars["--color-accent"],
    boxSizing: "border-box",
    pointerEvents: "none",
  },
  // A dark scrim over the trimmed-away footage (see TrimStrip.tsx) - sits ON the video thumbnails,
  // so it's a fixed dark regardless of the app theme (dimming reads the same on any theme).
  trimDim: {
    position: "absolute",
    top: 0,
    bottom: 0,
    backgroundColor: "#0000007a", // theme-exempt
    pointerEvents: "none",
  },
  handle: {
    position: "absolute",
    top: 14,
    width: 12,
    height: 20,
    marginLeft: -6,
    borderRadius: radiusVars["--radius-element"],
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
    gap: spacingVars["--spacing-1-5"],
  },
  // Pan control (section 4.3) - a slim scrollbar-shaped trough, only rendered while zoomed in.
  panTrough: {
    position: "relative",
    height: 10,
    borderRadius: radiusVars["--radius-element"],
    cursor: "pointer",
    touchAction: "none",
    backgroundColor: colorVars["--color-background-muted"],
  },
  panCutTick: {
    position: "absolute",
    top: 2,
    bottom: 2,
    minWidth: 2,
    borderRadius: radiusVars["--radius-element"],
    backgroundColor: colorVars["--color-accent"],
    pointerEvents: "none",
  },
  panThumb: {
    position: "absolute",
    top: 0,
    bottom: 0,
    borderRadius: radiusVars["--radius-element"],
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
