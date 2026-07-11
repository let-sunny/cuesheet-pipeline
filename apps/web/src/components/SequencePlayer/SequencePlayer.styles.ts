import * as stylex from "@stylexjs/stylex";
import { radiusVars, spacingVars, textSizeVars } from "@astryxdesign/core/theme/tokens.stylex";

/**
 * Component anatomy migration (docs/styling-migration.md, StyleX migration batch 5) — rules ported
 * 1:1 from the old `.sequence-*` classes in styles.css (all owned solely by this component).
 *
 * The playback-speed toggle is now a stock Astryx SegmentedControl (2026-07-11 stock-component
 * migration) - the old `.sequence-player-speed-toggle button`(+`.active`) plain-CSS exception and
 * its wrapper `speedToggle` xstyle are both gone with it.
 *
 * `background`/`border` shorthands are written out as their longhand equivalents - see
 * HeaderBar.styles.ts's comment for why (StyleX silently drops the shorthand form).
 *
 * Spacing/radius migration (2026-07-11, design-principles.md #5 strict rule, same reasoning as
 * MomentPalette.styles.ts's comment): `gap`/`padding`/`borderRadius` read from Astryx's
 * `spacingVars`/`radiusVars`. `top`/`left`/`right`/`bottom` position-offsets (`sceneHint`,
 * `subtitleBottom`/`subtitleTop`) stay literal - they're absolute-position placement ("which
 * elements sit where"), the strict rule's layout-structure carve-out, not spacing between
 * elements. Structural stage sizing (`maxWidth: 960`, `height: 8` progress-bar thickness) and
 * font-size/fixed overlay colors (always-dark stage) stay literal/deferred, same reasoning as
 * VideoPreview.styles.ts.
 */
export const styles = stylex.create({
  player: {
    display: "flex",
    flexDirection: "column",
    gap: spacingVars["--spacing-2"],
    alignItems: "center",
  },
  // containerType opens a container query context, so the subtitle overlay can use cqw units for
  // a font size/outline width that's "a % of this stage's actual rendered width".
  stage: {
    position: "relative",
    width: "100%",
    maxWidth: 960,
    maxHeight: "40vh",
    aspectRatio: "16 / 9",
    backgroundColor: "black",
    borderRadius: radiusVars["--radius-element"],
    overflow: "hidden",
    containerType: "inline-size",
  },
  video: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "contain",
    backgroundColor: "black",
  },
  videoHidden: {
    opacity: 0,
    pointerEvents: "none",
  },
  // A small hint (optional element) telling what scene the current cut is during sequential
  // playback — shown quietly at the top-left of the stage so it doesn't cover the subtitle, and
  // hidden for cuts with no match. Fixed dark color regardless of theme since it overlays the
  // stage's own always-dark background.
  sceneHint: {
    position: "absolute",
    top: 10,
    left: 10,
    right: 10,
    maxWidth: "calc(100% - 20px)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    padding: `3px ${spacingVars["--spacing-2"]}`,
    borderRadius: radiusVars["--radius-inner"],
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    color: "#d8dbe6",
    fontSize: textSizeVars["--font-size-sm"],
    pointerEvents: "none",
  },
  // NOT tokenized (2026-07-11 typography pass) - this is the actual subtitle-content preview
  // (real render output styling, driven by `effectiveStyle.size` via inline `style` in
  // SequencePlayer.tsx), not app chrome, so it's out of scope for the UI type-scale pass, same
  // reasoning as TitleOverlay.styles.ts.
  subtitle: {
    position: "absolute",
    left: 0,
    right: 0,
    padding: `0 ${spacingVars["--spacing-6"]}`,
    textAlign: "center",
    fontSize: 22,
    fontWeight: 700,
    lineHeight: 1.4,
    pointerEvents: "none",
  },
  // The actual offset is set inline by SequencePlayer.tsx based on subtitleStyle.margin - these
  // fixed values are just a fallback for the rare case where the margin calculation fails.
  subtitleBottom: {
    bottom: 24,
  },
  subtitleTop: {
    top: 24,
  },
  subtitleCenter: {
    top: "50%",
    transform: "translateY(-50%)",
  },
  subtitleText: {
    display: "inline-block",
    borderRadius: radiusVars["--radius-inner"],
    boxDecorationBreak: "clone",
    // Keeps a no-space run (e.g. a long URL/hashtag) contained in this preview - the actual
    // drawtext render never wraps, so this preview can't match it exactly, but this at least keeps
    // the *editor* preview readable.
    overflowWrap: "anywhere",
  },
  ended: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#9aa0b4",
    fontSize: textSizeVars["--font-size-base"],
  },
  progress: {
    width: "100%",
    maxWidth: 960,
    height: 8,
    backgroundColor: "var(--surface-2)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
    borderRadius: radiusVars["--radius-inner"],
    cursor: "pointer",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "var(--accent)",
  },
  controls: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacingVars["--spacing-3"],
    width: "100%",
    maxWidth: 960,
  },
  transport: {
    display: "flex",
    alignItems: "center",
    gap: spacingVars["--spacing-1-5"],
  },
  counter: {
    fontSize: textSizeVars["--font-size-sm"],
    color: "var(--text-tertiary)",
    marginLeft: "auto",
  },
});
