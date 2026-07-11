import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { TITLE_FONT_FAMILY, TITLE_FONT_SIZE_PX } from "./titleCardStyle.js";

export interface HighlightTitleProps {
  text: string;
  color: string;
}

/**
 * "highlight" preset - splits the text around a keyword (for now, always the LAST word; if the
 * whole text is one word, the whole text is the keyword) and sweeps a pastel marker span in behind
 * it via `scaleX`, transform-origin left, driven by a spring (same damping as the other presets'
 * entrances for a consistent cozy feel).
 */
export function HighlightTitle({ text, color }: HighlightTitleProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = text.split(" ");
  const keyword = words[words.length - 1] ?? text;
  const lead = words.slice(0, -1).join(" ");
  const markerProgress = spring({ fps, frame, config: { damping: 200 } });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "0.3em",
          fontFamily: TITLE_FONT_FAMILY,
          fontSize: TITLE_FONT_SIZE_PX,
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
              transform: `scaleX(${markerProgress})`,
              transformOrigin: "left",
            }}
          />
          <span style={{ position: "relative" }}>{keyword}</span>
        </span>
      </div>
    </AbsoluteFill>
  );
}

/** Pastel marker color behind the highlighted keyword. */
const MARKER_COLOR = "#A7C7E7";
