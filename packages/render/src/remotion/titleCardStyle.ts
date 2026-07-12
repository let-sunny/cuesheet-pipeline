import type { CSSProperties } from "react";

/**
 * Per-frame props every preset's browser-safe View (FadeTitleView/WordStaggerTitleView/
 * TypewriterTitleView/HighlightTitleView) accepts instead of reading Remotion's
 * useCurrentFrame()/useVideoConfig() context - this is the one seam between the Node render
 * pipeline and the browser preview. The Remotion wrapper (e.g. FadeTitle) feeds this from the
 * real composition context at render time; apps/web's TitlePreview feeds it from its own
 * requestAnimationFrame loop. Every View accepts this same shape (even fields it doesn't use) so
 * TitleCardView (the dispatcher in TitleCard.tsx) can pass one uniform prop bag to whichever
 * preset is active.
 */
export interface TitleViewFrameProps {
  frame: number;
  fps: number;
  durationInFrames: number;
}

/**
 * Plain-DOM stand-in for Remotion's `<AbsoluteFill style={{justifyContent:"center",
 * alignItems:"center"}}>`. AbsoluteFill needs a Remotion composition context, which the browser
 * preview does not have, so every preset View renders a plain `<div>` with this style instead
 * (identical visual result - same position:absolute/inset:0 fill, same centering).
 */
export const ABSOLUTE_FILL_CENTERED_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
};

/** Shared font/size for every title-card preset. Pretendard (a widely-used Korean-first sans) is
 * the default face (2026-07-12 user choice); it must be loaded wherever the title is drawn - the
 * browser preview loads it via @font-face (apps/web), and the Node render loads it before capture
 * (packages/render/src/title.ts) - falling back to the platform sans if unavailable. */
export const TITLE_FONT_FAMILY =
  "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, 'Apple SD Gothic Neo', sans-serif";
export const TITLE_FONT_SIZE_PX = 500;

/**
 * Fixed title-card text color (no schema field for this yet - every preset renders in this one
 * cozy, warm tone). Lives here (rather than in title.ts, which is Node-only) so it's importable
 * from the browser-safe `@cuesheet/render/remotion` subpath too - both the Node render pipeline
 * (title.ts's renderTitleFrames) and the web preview (apps/web's TitlePreview, plain-React/rAF -
 * @remotion/player was dropped after repeated frozen-frame failures in this environment) read
 * this single constant, so there's no hand-synced duplicate left to drift.
 */
export const TITLE_TEXT_COLOR = "#ffffff";

/** Default marker sweep color behind the "highlight" preset's last word. Kept in sync with the
 * schema's title.highlightColor default; HighlightTitleView falls back to this when no color is
 * passed. */
export const TITLE_HIGHLIGHT_COLOR = "#a7c7e7";
