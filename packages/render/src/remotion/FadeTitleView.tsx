import { interpolate, spring } from "remotion";
import { ABSOLUTE_FILL_CENTERED_STYLE, TITLE_FONT_FAMILY, type TitleViewFrameProps } from "./titleCardStyle.js";

export interface FadeTitleViewProps extends TitleViewFrameProps {
  text: string;
  color: string;
  fontSize: number;
}

export interface FadeTitleFrameValues {
  scale: number;
  opacity: number;
}

/**
 * Pure per-frame math for the "fade" preset - a spring-driven scale+opacity entrance (0.96 -> 1
 * scale, 0 -> 1 opacity), plus a gentle fade-out over the last ~12 frames so the card never
 * hard-cuts away right before the cut's own footage takes over. Uses only `spring`/`interpolate`
 * from "remotion" (pure math, no Remotion composition context needed), so this is safe to call
 * from a plain rAF loop in the browser as well as from the real Remotion render - see
 * FadeTitleView below and FadeTitle's thin Remotion wrapper, both of which call this same
 * function, so there is exactly one place this animation's math is written.
 */
export function computeFadeTitleFrame(frame: number, fps: number, durationInFrames: number): FadeTitleFrameValues {
  const enter = spring({ fps, frame, config: { damping: 200, mass: 0.8 } });
  const scale = interpolate(enter, [0, 1], [0.96, 1]);
  const enterOpacity = interpolate(enter, [0, 1], [0, 1]);
  const exitStart = Math.max(0, durationInFrames - EXIT_FRAMES);
  const exitOpacity = interpolate(frame, [exitStart, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
  });
  return { scale, opacity: enterOpacity * exitOpacity };
}

/**
 * Browser-safe view for the "fade" preset - takes its frame source as plain props (see
 * TitleViewFrameProps) instead of reading Remotion's useCurrentFrame()/useVideoConfig(), and
 * renders a plain positioned `<div>` instead of `<AbsoluteFill>` (which requires Remotion's
 * context). Used both by FadeTitle's Remotion wrapper (fed by the real composition frame) and by
 * apps/web's TitlePreview (fed by its own requestAnimationFrame loop) - identical markup/inline
 * styles either way, so the two callers can never visually drift from each other.
 */
export function FadeTitleView({ frame, fps, durationInFrames, text, color, fontSize }: FadeTitleViewProps) {
  const { scale, opacity } = computeFadeTitleFrame(frame, fps, durationInFrames);

  return (
    <div style={ABSOLUTE_FILL_CENTERED_STYLE}>
      <div
        style={{
          transform: `scale(${scale})`,
          opacity,
          fontFamily: TITLE_FONT_FAMILY,
          fontSize,
          letterSpacing: "0.02em",
          color,
        }}
      >
        {text}
      </div>
    </div>
  );
}

/** How many frames before the end the fade-out starts. */
const EXIT_FRAMES = 12;
