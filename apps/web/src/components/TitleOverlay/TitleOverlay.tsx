import { useEffect, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Player } from "@remotion/player";
import type { PlayerRef } from "@remotion/player";
import { IconButton } from "@astryxdesign/core/IconButton";
import type { Title } from "@cuesheet/schema";
import { TitleCard, TITLE_TEXT_COLOR } from "@cuesheet/render/remotion";
import type { TitleCardProps } from "@cuesheet/render/remotion";
import { styles } from "./TitleOverlay.styles.js";

export interface TitleOverlayProps {
  title: Title | null | undefined;
  /** Project output dimensions/frame rate - the Player renders the exact same TitleCard
   * composition the real render captures, at the project's real resolution/fps (pixel-identical
   * preview, no CSS-approximation drift). */
  projectWidth: number;
  projectHeight: number;
  projectFps: number;
}

/**
 * Live preview of a cut's title card (PRD backlog #2) - runs the REAL Remotion `TitleCard`
 * composition (packages/render/src/remotion/, exported browser-safely via the
 * `@cuesheet/render/remotion` subpath) through `@remotion/player`'s `<Player>`, instead of the
 * hand-written CSS approximation this replaces. This makes the preview pixel-identical to the
 * final render (single source of truth, no drift) and lets the animation actually PLAY, looping
 * on its own timeline independent of the underlying video's playhead. This is the first
 * full-anatomy component in the repo (folder + co-located .styles.ts + co-located test + index.ts
 * - see CLAUDE.md "component layering").
 */
export function TitleOverlay({ title, projectWidth, projectHeight, projectFps }: TitleOverlayProps) {
  const playerRef = useRef<PlayerRef>(null);
  const [isPlaying, setIsPlaying] = useState(true);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) {
      return;
    }
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    player.addEventListener("play", onPlay);
    player.addEventListener("pause", onPause);
    return () => {
      player.removeEventListener("play", onPlay);
      player.removeEventListener("pause", onPause);
    };
  }, [title]);

  if (!title) {
    return null;
  }

  const dim = title.backdrop?.dim ?? 0;
  const inputProps: TitleCardProps = {
    text: title.text,
    preset: title.preset,
    durationInSeconds: title.durationS,
    fps: projectFps,
    color: TITLE_TEXT_COLOR,
    width: projectWidth,
    height: projectHeight,
  };
  const durationInFrames = Math.max(1, Math.round(title.durationS * projectFps));

  return (
    <div {...stylex.props(styles.container)} data-testid="title-overlay">
      {dim > 0 ? <div {...stylex.props(styles.backdrop)} style={{ opacity: dim }} /> : null}
      <div {...stylex.props(styles.stage)}>
        <Player
          ref={playerRef}
          component={TitleCard}
          inputProps={inputProps}
          durationInFrames={durationInFrames}
          compositionWidth={projectWidth}
          compositionHeight={projectHeight}
          fps={projectFps}
          loop
          autoPlay
          controls={false}
          style={PLAYER_STYLE}
          acknowledgeRemotionLicense
        />
      </div>
      <div {...stylex.props(styles.controls)}>
        <IconButton
          label="Restart title preview"
          icon={<span aria-hidden="true">{"⏮"}</span>}
          variant="ghost"
          size="sm"
          onClick={() => playerRef.current?.seekTo(0)}
          data-testid="title-preview-restart"
        />
        <IconButton
          label={isPlaying ? "Pause title preview" : "Play title preview"}
          icon={<span aria-hidden="true">{isPlaying ? "⏸" : "⏵"}</span>}
          variant="ghost"
          size="sm"
          onClick={() => playerRef.current?.toggle()}
          data-testid="title-preview-playpause"
        />
      </div>
    </div>
  );
}

/** Transparent over the video stage - the TitleCard composition itself sets no background, so the
 * Player's own wrapper must not paint an opaque one either. */
const PLAYER_STYLE = { width: "100%", height: "100%", backgroundColor: "transparent" };
