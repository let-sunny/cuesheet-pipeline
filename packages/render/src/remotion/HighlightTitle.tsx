import { useCurrentFrame, useVideoConfig } from "remotion";
import { HighlightTitleView } from "./HighlightTitleView.js";

export interface HighlightTitleProps {
  text: string;
  color: string;
  fontSize: number;
}

/**
 * "highlight" preset - thin Remotion wrapper over HighlightTitleView, which owns the actual
 * animation math (shared with apps/web's browser preview - see HighlightTitleView.tsx's doc
 * comment).
 */
export function HighlightTitle({ text, color, fontSize }: HighlightTitleProps) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  return (
    <HighlightTitleView frame={frame} fps={fps} durationInFrames={durationInFrames} text={text} color={color} fontSize={fontSize} />
  );
}
