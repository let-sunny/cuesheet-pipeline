import { useCurrentFrame, useVideoConfig } from "remotion";
import { FadeTitleView } from "./FadeTitleView.js";

export interface FadeTitleProps {
  text: string;
  color: string;
  fontSize: number;
}

/**
 * "fade" preset (PRD backlog #2) - thin Remotion wrapper over FadeTitleView, which owns the
 * actual animation math (shared with apps/web's browser preview - see FadeTitleView.tsx's doc
 * comment). This wrapper's only job is feeding the real composition's frame/fps/durationInFrames
 * in as plain props.
 */
export function FadeTitle({ text, color, fontSize }: FadeTitleProps) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  return <FadeTitleView frame={frame} fps={fps} durationInFrames={durationInFrames} text={text} color={color} fontSize={fontSize} />;
}
