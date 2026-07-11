import { interpolate, spring } from "remotion";
import { ABSOLUTE_FILL_CENTERED_STYLE, TITLE_FONT_FAMILY, type TitleViewFrameProps } from "./titleCardStyle.js";

export interface WordStaggerTitleViewProps extends TitleViewFrameProps {
  text: string;
  color: string;
  fontSize: number;
}

export interface WordStaggerWordValue {
  word: string;
  opacity: number;
  translateY: number;
}

/**
 * Pure per-frame math for the "wordStagger" preset - splits the text on spaces; each word eases
 * in (opacity + a small upward translate) via its own spring, delayed a fixed number of frames
 * per word index so they arrive in sequence rather than all at once. Uses only
 * `spring`/`interpolate` from "remotion" (pure math, no Remotion composition context needed) -
 * see WordStaggerTitleView below and WordStaggerTitle's thin Remotion wrapper, both of which call
 * this same function.
 */
export function computeWordStaggerFrame(frame: number, fps: number, text: string): WordStaggerWordValue[] {
  return text.split(" ").map((word, i) => {
    const p = spring({ fps, frame, delay: i * DELAY_FRAMES_PER_WORD, config: { damping: 200 } });
    const translateY = interpolate(p, [0, 1], [14, 0]);
    return { word, opacity: p, translateY };
  });
}

/**
 * Browser-safe view for the "wordStagger" preset - see FadeTitleView.tsx's doc comment for the
 * shared-View rationale (plain props instead of Remotion context, plain `<div>` instead of
 * `<AbsoluteFill>`).
 */
export function WordStaggerTitleView({ frame, fps, text, color, fontSize }: WordStaggerTitleViewProps) {
  const words = computeWordStaggerFrame(frame, fps, text);

  return (
    <div style={ABSOLUTE_FILL_CENTERED_STYLE}>
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
        {words.map((w, i) => (
          <span key={i} style={{ opacity: w.opacity, transform: `translateY(${w.translateY}px)` }}>
            {w.word}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Frame delay applied to each successive word's own spring (creates the stagger). */
const DELAY_FRAMES_PER_WORD = 5;
