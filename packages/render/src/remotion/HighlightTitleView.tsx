import { spring } from "remotion";
import { ABSOLUTE_FILL_CENTERED_STYLE, TITLE_FONT_FAMILY, type TitleViewFrameProps } from "./titleCardStyle.js";

export interface HighlightTitleViewProps extends TitleViewFrameProps {
  text: string;
  color: string;
  fontSize: number;
}

export interface HighlightFrameValues {
  lead: string;
  keyword: string;
  markerScaleX: number;
}

/**
 * Pure per-frame math for the "highlight" preset - splits the text around a keyword (for now,
 * always the LAST word; if the whole text is one word, the whole text is the keyword) and sweeps
 * a pastel marker span in behind it via `scaleX`, driven by a spring (same damping as the other
 * presets' entrances for a consistent cozy feel). Uses only `spring` from "remotion" (pure math,
 * no Remotion composition context needed) - see HighlightTitleView below and HighlightTitle's
 * thin Remotion wrapper, both of which call this same function.
 */
export function computeHighlightFrame(frame: number, fps: number, text: string): HighlightFrameValues {
  const words = text.split(" ");
  const keyword = words[words.length - 1] ?? text;
  const lead = words.slice(0, -1).join(" ");
  const markerScaleX = spring({ fps, frame, config: { damping: 200 } });
  return { lead, keyword, markerScaleX };
}

/**
 * Browser-safe view for the "highlight" preset - see FadeTitleView.tsx's doc comment for the
 * shared-View rationale (plain props instead of Remotion context, plain `<div>` instead of
 * `<AbsoluteFill>`).
 */
export function HighlightTitleView({ frame, fps, text, color, fontSize }: HighlightTitleViewProps) {
  const { lead, keyword, markerScaleX } = computeHighlightFrame(frame, fps, text);

  return (
    <div style={ABSOLUTE_FILL_CENTERED_STYLE}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "0.3em",
          fontFamily: TITLE_FONT_FAMILY,
          fontSize,
          color,
        }}
      >
        {lead ? <span>{lead}</span> : null}
        <span style={{ position: "relative", display: "inline-block" }}>
          <span
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: "0.08em",
              height: "0.35em",
              backgroundColor: MARKER_COLOR,
              transform: `scaleX(${markerScaleX})`,
              transformOrigin: "left",
            }}
          />
          <span style={{ position: "relative" }}>{keyword}</span>
        </span>
      </div>
    </div>
  );
}

/** Pastel marker color behind the highlighted keyword. */
const MARKER_COLOR = "#A7C7E7";
