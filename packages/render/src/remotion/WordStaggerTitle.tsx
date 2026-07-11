import { useCurrentFrame, useVideoConfig } from "remotion";
import { WordStaggerTitleView } from "./WordStaggerTitleView.js";

export interface WordStaggerTitleProps {
  text: string;
  color: string;
  fontSize: number;
}

/**
 * "wordStagger" preset - thin Remotion wrapper over WordStaggerTitleView, which owns the actual
 * animation math (shared with apps/web's browser preview - see WordStaggerTitleView.tsx's doc
 * comment).
 */
export function WordStaggerTitle({ text, color, fontSize }: WordStaggerTitleProps) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  return (
    <WordStaggerTitleView frame={frame} fps={fps} durationInFrames={durationInFrames} text={text} color={color} fontSize={fontSize} />
  );
}
