import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { TITLE_FONT_FAMILY } from "./titleCardStyle.js";

export interface WordStaggerTitleProps {
  text: string;
  color: string;
  fontSize: number;
}

/**
 * "wordStagger" preset - splits the text on spaces; each word eases in (opacity + a small upward
 * translate) via its own spring, delayed a fixed number of frames per word index so they arrive in
 * sequence rather than all at once.
 */
export function WordStaggerTitle({ text, color, fontSize }: WordStaggerTitleProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = text.split(" ");

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          columnGap: "0.4em",
          rowGap: "0.1em",
          fontFamily: TITLE_FONT_FAMILY,
          fontSize,
          color,
        }}
      >
        {words.map((word, i) => {
          const p = spring({ fps, frame, delay: i * DELAY_FRAMES_PER_WORD, config: { damping: 200 } });
          const translateY = interpolate(p, [0, 1], [14, 0]);
          return (
            <span key={i} style={{ opacity: p, transform: `translateY(${translateY}px)` }}>
              {word}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

/** Frame delay applied to each successive word's own spring (creates the stagger). */
const DELAY_FRAMES_PER_WORD = 5;
