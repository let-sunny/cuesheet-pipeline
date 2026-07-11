import { useCurrentFrame, useVideoConfig } from "remotion";
import { TypewriterTitleView } from "./TypewriterTitleView.js";

export interface TypewriterTitleProps {
  text: string;
  color: string;
  fontSize: number;
}

/**
 * "typing" preset - thin Remotion wrapper over TypewriterTitleView, which owns the actual
 * animation math (shared with apps/web's browser preview - see TypewriterTitleView.tsx's doc
 * comment).
 */
export function TypewriterTitle({ text, color, fontSize }: TypewriterTitleProps) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  return (
    <TypewriterTitleView frame={frame} fps={fps} durationInFrames={durationInFrames} text={text} color={color} fontSize={fontSize} />
  );
}
