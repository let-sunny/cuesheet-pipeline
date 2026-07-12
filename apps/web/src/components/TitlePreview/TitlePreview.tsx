import { useEffect, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import type { TitlePreset } from "@cuesheet/schema";
import { TitleCardView } from "@cuesheet/render/remotion";
import { useTitleFrameLoop } from "../../hooks/useTitleFrameLoop.js";
import { computeTitleStageTransform } from "../../lib/titleStageTransform.js";
import { styles } from "./TitlePreview.styles.js";

export interface TitlePreviewProps {
  text: string;
  preset: TitlePreset;
  color: string;
  fontSize: number;
  /** Marker sweep color for the "highlight" preset; ignored by the other presets. */
  highlightColor?: string;
  durationInFrames: number;
  fps: number;
  /** Project output dimensions - the composition renders at this native pixel size (the same
   * coordinate space the real Remotion render captures, e.g. fontSize is authored against a
   * 1920-wide canvas) and is then scaled via CSS transform to fit whatever box this component
   * itself ends up rendered at (see computeTitleStageTransform). */
  projectWidth: number;
  projectHeight: number;
  /** Pausing stops the rAF loop outright (see useTitleFrameLoop). */
  playing: boolean;
  /** Bump this (e.g. an incrementing counter) to reset playback to frame 0 - the caller (
   * TitleOverlay) owns this alongside `playing`, since both are driven by the same restart/
   * play-pause controls. */
  restartToken: number;
}

/**
 * Plain-React, requestAnimationFrame-driven preview of a cut's title card (PRD backlog #2) -
 * renders the REAL preset animation math (TitleCardView, from `@cuesheet/render/remotion` -
 * `spring`/`interpolate` are pure functions, so this is pixel-identical to the real render with
 * zero Remotion runtime in the browser) instead of running it through `@remotion/player`'s
 * `<Player>`, which repeatedly failed to reliably animate in this Vite+workspace environment
 * (crash from a dual React instance, then frozen at frame 0 from a Player/composition Remotion-
 * context mismatch, then still frozen in a real browser even with an explicit play() nudge - see
 * docs/goals for the full history). Its own frame counter (useTitleFrameLoop) is guaranteed to
 * animate: plain React state advanced by rAF + elapsed real time, no external runtime required.
 */
export function TitlePreview({
  text,
  preset,
  color,
  fontSize,
  highlightColor,
  durationInFrames,
  fps,
  projectWidth,
  projectHeight,
  playing,
  restartToken,
}: TitlePreviewProps) {
  const { frame } = useTitleFrameLoop({ fps, durationInFrames, playing, restartToken });
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
