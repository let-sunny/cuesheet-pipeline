import * as stylex from "@stylexjs/stylex";
import type { Title } from "@cuesheet/schema";
import { TITLE_FONT_SIZE_PX, TITLE_HIGHLIGHT_COLOR, TITLE_TEXT_COLOR } from "@cuesheet/render/remotion";
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
 * animate in this Vite+workspace environment.
 *
 * The preview auto-loops on its own (playing is always on); it carries NO play/pause/restart
 * controls of its own (2026-07-12 user feedback - a floating control chip over the video overlapped
 * the burned-in subtitle). It's a passive, always-animating preview layered over the video, so the
 * title reads in the context of the actual footage without adding chrome on top of it.
 */
export function TitleOverlay({ title, projectWidth, projectHeight, projectFps }: TitleOverlayProps) {
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
          highlightColor={title.highlightColor ?? TITLE_HIGHLIGHT_COLOR}
          durationInFrames={durationInFrames}
          fps={projectFps}
          projectWidth={projectWidth}
          projectHeight={projectHeight}
          playing
          restartToken={0}
        />
      </div>
    </div>
  );
}
