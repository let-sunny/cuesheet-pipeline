import { useEffect, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import type { TitlePreset } from "@cuesheet/schema";
import { TitleCardView } from "@cuesheet/render/remotion";
import { computeTitleStageTransform } from "../../lib/titleStageTransform.js";
import { styles } from "./TitlePreview.styles.js";

export interface TitlePreviewProps {
  text: string;
  preset: TitlePreset;
  color: string;
  fontSize: number;
  /** Marker sweep color for the "highlight" preset; ignored by the other presets. */
  highlightColor?: string;
  /** The exact animation frame to show. The title is timeline-driven (see TitleOverlay): the caller
   * derives this from the cut's playback position, so the title animates in step with the footage
   * and lands on its final frame when scrubbed/paused - it is NOT a self-looping preview anymore. */
  frame: number;
  /** Total title-animation length in frames - the presets author their reveal against this (e.g.
   * typing spreads its characters across the whole span), independent of `frame`. */
  durationInFrames: number;
  fps: number;
  /** Project output dimensions - the composition renders at this native pixel size (the same
   * coordinate space the real Remotion render captures, e.g. fontSize is authored against a
   * 1920-wide canvas) and is then scaled via CSS transform to fit whatever box this component
   * itself ends up rendered at (see computeTitleStageTransform). */
  projectWidth: number;
  projectHeight: number;
}

/**
 * Plain-React preview of a cut's title card (PRD backlog #2) - renders the REAL preset animation
 * math (TitleCardView, from `@cuesheet/render/remotion` - `spring`/`interpolate` are pure functions,
 * so this is pixel-identical to the real render with zero Remotion runtime in the browser) instead
 * of running it through `@remotion/player`'s `<Player>`, which repeatedly failed to reliably animate
 * in this Vite+workspace environment (see docs/goals for the history).
 *
 * The frame is fully controlled by the caller (TitleOverlay drives it from the cut's playback
 * position), so the title appears at the cut's start, animates as the footage plays, and is gone
 * once playback passes the title's duration - matching what the render bakes in. It used to
 * self-loop on its own rAF clock, decoupled from the video, which read as "the title is always up".
 */
export function TitlePreview({
  text,
  preset,
  color,
  fontSize,
  highlightColor,
  frame,
  durationInFrames,
  fps,
  projectWidth,
  projectHeight,
}: TitlePreviewProps) {
  const [box, setBox] = useState({ width: 0, height: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      setBox({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { scale, offsetX, offsetY } = computeTitleStageTransform(box.width, box.height, projectWidth, projectHeight);

  return (
    <div ref={viewportRef} {...stylex.props(styles.viewport)} data-testid="title-preview">
      <div
        style={{
          position: "absolute",
          left: offsetX,
          top: offsetY,
          width: projectWidth,
          height: projectHeight,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
        data-testid="title-preview-canvas"
      >
        <TitleCardView
          frame={frame}
          fps={fps}
          durationInFrames={durationInFrames}
          text={text}
          preset={preset}
          color={color}
          fontSize={fontSize}
          highlightColor={highlightColor}
        />
      </div>
    </div>
  );
}
