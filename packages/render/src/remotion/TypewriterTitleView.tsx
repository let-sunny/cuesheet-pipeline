import { interpolate } from "remotion";
import { ABSOLUTE_FILL_CENTERED_STYLE, TITLE_FONT_FAMILY, type TitleViewFrameProps } from "./titleCardStyle.js";

export interface TypewriterTitleViewProps extends TitleViewFrameProps {
  text: string;
  color: string;
  fontSize: number;
}

export interface TypewriterFrameValues {
  shown: string;
  cursorOpacity: number;
  cursorVisible: boolean;
}

/**
 * Pure per-frame math for the "typing" preset - a typewriter reveal via STRING SLICING (never
 * per-character opacity/DOM churn), matching the render pipeline's frame-steppable, deterministic
 * contract. `charsShown` advances one character every CHAR_FRAMES frames (>= 2, a calm pace
 * rather than a jittery one), followed by a smooth blinking block cursor while text remains to
 * reveal. Uses only `interpolate` from "remotion" (pure math, no Remotion composition context
 * needed) - see TypewriterTitleView below and TypewriterTitle's thin Remotion wrapper, both of
 * which call this same function.
 */
export function computeTypewriterFrame(frame: number, text: string): TypewriterFrameValues {
  const chars = Array.from(text);
  const charsShown = Math.min(chars.length, Math.floor(frame / CHAR_FRAMES));
  const shown = chars.slice(0, charsShown).join("");
  const cursorOpacity = interpolate(
    frame % CURSOR_BLINK_FRAMES,
    [0, CURSOR_BLINK_FRAMES / 2, CURSOR_BLINK_FRAMES],
    [1, 0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const cursorVisible = charsShown < chars.length;
  return { shown, cursorOpacity, cursorVisible };
}

/**
 * Browser-safe view for the "typing" preset - see FadeTitleView.tsx's doc comment for the
 * shared-View rationale (plain props instead of Remotion context, plain `<div>` instead of
 * `<AbsoluteFill>`).
 */
export function TypewriterTitleView({ frame, text, color, fontSize }: TypewriterTitleViewProps) {
  const { shown, cursorOpacity, cursorVisible } = computeTypewriterFrame(frame, text);

  return (
    <div style={ABSOLUTE_FILL_CENTERED_STYLE}>
      <div style={{ fontFamily: TITLE_FONT_FAMILY, fontSize, color, display: "flex", alignItems: "center" }}>
        <span>{shown}</span>
        <span
          style={{
            display: "inline-block",
            width: "0.08em",
            height: "1.05em",
            marginLeft: "0.06em",
            backgroundColor: color,
            opacity: cursorVisible ? cursorOpacity : 0,
          }}
        />
      </div>
    </div>
  );
}

/** Frames held per revealed character - >= 2 keeps the reveal calm rather than jittery. */
const CHAR_FRAMES = 2;
/** Full blink cycle (on -> off -> on) length in frames. */
const CURSOR_BLINK_FRAMES = 16;
