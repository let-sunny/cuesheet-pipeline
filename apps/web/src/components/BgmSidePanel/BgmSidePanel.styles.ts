import * as stylex from "@stylexjs/stylex";
import {
  colorVars,
  radiusVars,
  spacingVars,
  textSizeVars,
  fontWeightVars,
} from "@astryxdesign/core/theme/tokens.stylex";

// Reminder: StyleX silently drops shorthand properties - write `background`/`border` out as their
// longhand equivalents (`backgroundColor`, `borderWidth` + `borderStyle` + `borderColor`), and
// `flex` as `flexGrow` + `flexShrink` + `flexBasis`. See HeaderBar.styles.ts for the full writeup.
//
// Ported 1:1 from the bars' old home in CompactSegmentList.styles.ts (`gutterBar`/`gutterHandle`/
// `gutterBarLabel`/`gutterCountBadge`) — same rules, new file, see BgmSidePanel.tsx's header
// comment for why the rail sits beside (not above) the gutter column.
export const styles = stylex.create({
  root: {
    display: "flex",
    flexDirection: "row",
    gap: spacingVars["--spacing-1"],
    alignSelf: "stretch",
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto",
  },
  rail: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: spacingVars["--spacing-1-5"],
    paddingTop: spacingVars["--spacing-1"],
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto",
    width: 28,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colorVars["--color-border"],
    borderRadius: radiusVars["--radius-element"],
  },
  railCountBadge: {
    padding: `0 ${spacingVars["--spacing-1"]}`,
    borderRadius: radiusVars["--radius-element"],
    fontSize: textSizeVars["--font-size-xs"],
    fontWeight: fontWeightVars["--font-weight-semibold"],
    backgroundColor: colorVars["--color-background-green"],
    color: colorVars["--color-text-green"],
  },
  // Rotated vertical label — the discoverability affordance that replaces the old horizontal
  // "Background music" header text (dropped since a header row above the gutter column would
  // misalign its bars from the cut rows, see BgmSidePanel.tsx). Content-sized (no flexGrow): it
  // must NOT stretch to fill the rail, or the add-track "+" that follows it gets pushed to the
  // far bottom of a tall rail and becomes unreachable (2026-07-12 fix). Label + "+" stay clustered
  // near the top instead.
  railLabel: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto",
    writingMode: "vertical-rl",
    textOrientation: "mixed",
    fontSize: textSizeVars["--font-size-xs"],
    color: colorVars["--color-text-secondary"],
    paddingBottom: spacingVars["--spacing-1"],
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
});
