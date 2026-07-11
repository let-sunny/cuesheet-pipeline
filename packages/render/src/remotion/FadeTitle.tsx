import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { TITLE_FONT_FAMILY } from "./titleCardStyle.js";

export interface FadeTitleProps {
  text: string;
  color: string;
  fontSize: number;
}

/**
 * "fade" preset - the calm default (PRD backlog #2). A spring-driven scale+opacity entrance
 * (0.96 -> 1 scale, 0 -> 1 opacity), plus a gentle fade-out over the last ~12 frames so the card
 * never hard-cuts away right before the cut's own footage takes over.
 */
export function FadeTitle({ text, color, fontSize }: FadeTitleProps) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const enter = spring({ fps, frame, config: { damping: 200, mass: 0.8 } });
  const scale = interpolate(enter, [0, 1], [0.96, 1]);
  const enterOpacity = interpolate(enter, [0, 1], [0, 1]);
  const exitStart = Math.max(0, durationInFrames - EXIT_FRAMES);
  const exitOpacity = interpolate(frame, [exitStart, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
  });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div
        style={{
          transform: `scale(${scale})`,
          opacity: enterOpacity * exitOpacity,
          fontFamily: TITLE_FONT_FAMILY,
          fontSize,
          letterSpacing: "0.02em",
          color,
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
}

/** How many frames before the end the fade-out starts. */
const EXIT_FRAMES = 12;
