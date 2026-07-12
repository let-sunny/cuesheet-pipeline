import * as stylex from "@stylexjs/stylex";
import type { Title } from "@cuesheet/schema";
import { TITLE_FONT_SIZE_PX, TITLE_HIGHLIGHT_COLOR, TITLE_TEXT_COLOR } from "@cuesheet/render/remotion";
import { TitlePreview } from "../TitlePreview/index.js";
import { styles } from "./TitleOverlay.styles.js";

export interface TitleOverlayProps {
  title: Title | null | undefined;
  /** The cut's current playback position, absolute seconds (the <video>'s currentTime). The title
   * is only shown while this is within the title's window [inS, inS + title.durationS). */
  currentTimeS: number;
  /** The cut's in-point (segment.in), so the title window can be measured from the cut's start. */
  inS: number;
  /** Whether the cut is playing. Playing animates the title in step with the footage (and it
   * disappears once playback passes its duration); paused shows the title's finished frame so a
   * just-added title reads immediately instead of as a half-revealed first frame. */
  isPlaying: boolean;
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
 * The title is timeline-driven off the cut's own playback position (2026-07-12 user feedback -
 * the earlier self-looping preview animated forever regardless of the video, which read as "the
 * title is always up"): it's shown only within its window [in, in+durationS), animates in step
 * with the footage while playing, and disappears once playback passes its duration - exactly what
 * the render bakes in. Paused, it shows its finished frame so a just-added title reads immediately.
 * It carries no play/pause/restart chrome of its own - it's a passive overlay layered over the
 * video, driven entirely by the video's own transport.
 */
export function TitleOverlay({ title, currentTimeS, inS, isPlaying, projectWidth, projectHeight, projectFps }: TitleOverlayProps) {
  if (!title) {
    return null;
  }

  const durationInFrames = Math.max(1, Math.round(title.durationS * projectFps));
  const elapsedS = currentTimeS - inS;
  // The title exists only at the START of the cut, for its own duration. Once playback passes that
  // window it's gone (the footage plays alone) - the same windowing the render bakes in. This is
  // what makes the title "appear then disappear" instead of hanging over the whole cut.
  if (elapsedS < 0 || elapsedS >= title.durationS) {
    return null;
  }

  const dim = title.backdrop?.dim ?? 0;
  // Playing: the live frame, so the title animates and clears in step with the footage. Paused: the
  // final frame, so a just-added title (video parked at the cut's in-point) shows its finished look
  // rather than a half-typed/half-faded first frame.
  const frame = isPlaying ? Math.round(elapsedS * projectFps) : durationInFrames;

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
          frame={frame}
          durationInFrames={durationInFrames}
          fps={projectFps}
          projectWidth={projectWidth}
          projectHeight={projectHeight}
        />
      </div>
    </div>
  );
}
