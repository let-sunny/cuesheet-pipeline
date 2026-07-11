import { useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { IconButton } from "@astryxdesign/core/IconButton";
import type { Title } from "@cuesheet/schema";
import { TITLE_FONT_SIZE_PX, TITLE_TEXT_COLOR } from "@cuesheet/render/remotion";
import { TitlePreview } from "../TitlePreview/index.js";
import { styles } from "./TitleOverlay.styles.js";

export interface TitleOverlayProps {
  title: Title | null | undefined;
  /** Project output dimensions/frame rate - TitlePreview renders the exact same TitleCardView
   * animation the real render captures, at the project's real resolution/fps (pixel-identical
   * preview, no CSS-approximation drift). */
  projectWidth: number;
  projectHeight: number;
  projectFps: number;
}

/**
 * Live preview of a cut's title card (PRD backlog #2) - renders TitlePreview (apps/web's own
 * plain-React, requestAnimationFrame-driven component - see its doc comment) instead of running
 * the composition through `@remotion/player`'s `<Player>`, which repeatedly failed to reliably
 * animate in this Vite+workspace environment. This is the first full-anatomy component in the
 * repo (folder + co-located .styles.ts + co-located test + index.ts - see CLAUDE.md "component
 * layering"). Owns the play/pause + restart state the controls below drive, passed down to
 * TitlePreview as plain props (`playing`/`restartToken`) rather than an imperative ref.
 */
export function TitleOverlay({ title, projectWidth, projectHeight, projectFps }: TitleOverlayProps) {
  const [isPlaying, setIsPlaying] = useState(true);
  const [restartToken, setRestartToken] = useState(0);

  if (!title) {
    return null;
  }

  const dim = title.backdrop?.dim ?? 0;
  const durationInFrames = Math.max(1, Math.round(title.durationS * projectFps));

  return (
    <div {...stylex.props(styles.container)} data-testid="title-overlay">
      {dim > 0 ? <div {...stylex.props(styles.backdrop)} style={{ opacity: dim }} /> : null}
      <div {...stylex.props(styles.stage)}>
        <TitlePreview
          text={title.text}
          preset={title.preset}
          // title.color/title.size are schema fields with defaults, so they're always present on
          // a validated cuesheet - the ?? fallback only matters for a title object built before
          // the fields existed (e.g. a stale in-memory draft not yet round-tripped through
          // validation).
          color={title.color ?? TITLE_TEXT_COLOR}
          fontSize={title.size ?? TITLE_FONT_SIZE_PX}
          durationInFrames={durationInFrames}
          fps={projectFps}
          projectWidth={projectWidth}
          projectHeight={projectHeight}
          playing={isPlaying}
          restartToken={restartToken}
        />
      </div>
      <div {...stylex.props(styles.controls)}>
        <IconButton
          label="Restart title preview"
          // Fixed white glyph color - the scrim behind these controls is a fixed dark regardless
          // of app theme (see styles.controls), so the glyph must stay fixed-light too rather than
          // following the app's (theme-dependent) default text color, or it would be invisible
          // against the scrim in light theme. // theme-exempt
          icon={
            <span aria-hidden="true" style={ICON_GLYPH_STYLE}>
              {"⏮"}
            </span>
          }
          variant="ghost"
          size="sm"
          onClick={() => setRestartToken((t) => t + 1)}
          data-testid="title-preview-restart"
        />
        <IconButton
          label={isPlaying ? "Pause title preview" : "Play title preview"}
          icon={
            <span aria-hidden="true" style={ICON_GLYPH_STYLE}>
              {isPlaying ? "⏸" : "⏵"}
            </span>
          }
          variant="ghost"
          size="sm"
          onClick={() => setIsPlaying((p) => !p)}
          data-testid="title-preview-playpause"
        />
      </div>
    </div>
  );
}

/** Fixed white - pairs with styles.controls's fixed-dark scrim (see the icon prop's doc comment
 * above). // theme-exempt */
const ICON_GLYPH_STYLE = { color: "#ffffff" };
