import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { TITLE_FONT_FAMILY, TITLE_FONT_SIZE_PX } from "./titleCardStyle.js";

export interface TypewriterTitleProps {
  text: string;
  color: string;
}

/**
 * "typing" preset - a typewriter reveal via STRING SLICING (never per-character opacity/DOM
 * churn), matching the render pipeline's frame-steppable, deterministic contract. `charsShown`
 * advances one character every CHAR_FRAMES frames (>= 2, a calm pace rather than a jittery one),
 * followed by a smooth blinking block cursor while text remains to reveal.
 */
export function TypewriterTitle({ text, color }: TypewriterTitleProps) {
  const frame = useCurrentFrame();
  const chars = Array.from(text);
  const charsShown = Math.min(chars.length, Math.floor(frame / CHAR_FRAMES));
  const shown = chars.slice(0, charsShown).join("");
  const cursorOpacity = interpolate(frame % CURSOR_BLINK_FRAMES, [0, CURSOR_BLINK_FRAMES / 2, CURSOR_BLINK_FRAMES], [1, 0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const cursorVisible = charsShown < chars.length;

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div style={{ fontFamily: TITLE_FONT_FAMILY, fontSize: TITLE_FONT_SIZE_PX, color, display: "flex", alignItems: "center" }}>
        <span>{shown}</span>
        <span
          style={{
            display: "inline-block",
            width: "0.5em",
            height: "0.9em",
            marginLeft: "0.08em",
            backgroundColor: color,
            opacity: cursorVisible ? cursorOpacity : 0,
          }}
        />
      </div>
    </AbsoluteFill>
  );
}

/** Frames held per revealed character - >= 2 keeps the reveal calm rather than jittery. */
const CHAR_FRAMES = 2;
/** Full blink cycle (on -> off -> on) length in frames. */
const CURSOR_BLINK_FRAMES = 16;
