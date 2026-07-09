import * as stylex from "@stylexjs/stylex";

/**
 * Component anatomy migration (docs/styling-migration.md, StyleX migration batch 5) — rules ported
 * 1:1 from the old `.sequence-*` classes in styles.css (all owned solely by this component; no
 * `.plain-button` marker collisions, except the speed-toggle buttons noted below).
 *
 * NOT migrated here (stay plain CSS, see styles.css):
 * - `.sequence-player-speed-toggle button` (+ `.active`) — a descendant selector (1 class + tag,
 *   so higher specificity than `.plain-button` regardless of source order) that sets the speed
 *   buttons' own background/border/color/padding, overriding several of `.plain-button`'s
 *   properties - StyleX can't express that specificity edge, same root cause as HeaderBar's theme
 *   toggle / MiniTimelineStrip's zoom-controls button. The wrapper's own layout
 *   (`.sequence-player-speed-toggle`'s flex/gap, below as `speedToggle`) still moves to StyleX -
 *   the div keeps both the plain `sequence-player-speed-toggle` className *and* the StyleX class
 *   so the descendant selector keeps matching (same hybrid pattern as CompactSegmentList's
 *   `compact-list-actions`).
 *
 * `background`/`border` shorthands are written out as their longhand equivalents - see
 * HeaderBar.styles.ts's comment for why (StyleX silently drops the shorthand form).
 */
export const styles = stylex.create({
  player: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
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
    borderRadius: 8,
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
    padding: "3px 8px",
    borderRadius: 4,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    color: "#d8dbe6",
    fontSize: 12,
    pointerEvents: "none",
  },
  subtitle: {
    position: "absolute",
    left: 0,
    right: 0,
    padding: "0 24px",
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
    borderRadius: 2,
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
    fontSize: 15,
  },
  progress: {
    width: "100%",
    maxWidth: 960,
    height: 8,
    backgroundColor: "var(--surface-2)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
    borderRadius: 4,
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
    gap: 12,
    width: "100%",
    maxWidth: 960,
  },
  transport: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  speedToggle: {
    display: "flex",
    gap: 4,
  },
  counter: {
    fontSize: 13,
    color: "var(--text-tertiary)",
    marginLeft: "auto",
  },
});
