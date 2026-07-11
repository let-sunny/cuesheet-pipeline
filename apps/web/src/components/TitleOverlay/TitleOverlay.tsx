import { useEffect, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Player } from "@remotion/player";
import type { PlayerRef } from "@remotion/player";
import { IconButton } from "@astryxdesign/core/IconButton";
import type { Title } from "@cuesheet/schema";
import { TitleCard, TITLE_FONT_SIZE_PX, TITLE_TEXT_COLOR } from "@cuesheet/render/remotion";
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
    // title.color/title.size are schema fields with defaults, so they're always present on a
    // validated cuesheet - the ?? fallback only matters for a title object built before the
    // fields existed (e.g. a stale in-memory draft not yet round-tripped through validation).
    color: title.color ?? TITLE_TEXT_COLOR,
    fontSize: title.size ?? TITLE_FONT_SIZE_PX,
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
          // Required for autoPlay to actually start: the Player pre-mounts silent audio tags, so
          // even this audio-less title composition is treated as media and the browser's autoplay
          // policy blocks playback that isn't muted + user-initiated - which left the preview frozen
          // at frame 0. `initiallyMuted` is Remotion's documented fix (docs/player/autoplay: "useful
          // if the video must autoplay regardless of the autoplay policy of the browser"); the title
          // has no audio, so muting has no downside.
          initiallyMuted
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
