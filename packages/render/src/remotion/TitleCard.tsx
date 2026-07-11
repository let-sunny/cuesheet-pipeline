import type { TitlePreset } from "@cuesheet/schema";
import { FadeTitle } from "./FadeTitle.js";
import { FadeTitleView } from "./FadeTitleView.js";
import { HighlightTitle } from "./HighlightTitle.js";
import { HighlightTitleView } from "./HighlightTitleView.js";
import { TypewriterTitle } from "./TypewriterTitle.js";
import { TypewriterTitleView } from "./TypewriterTitleView.js";
import { WordStaggerTitle } from "./WordStaggerTitle.js";
import { WordStaggerTitleView } from "./WordStaggerTitleView.js";
import type { TitleViewFrameProps } from "./titleCardStyle.js";

// Re-exported so this file (the `@cuesheet/render/remotion` subpath's target - see package.json's
// exports map) is the single entry point browser code (apps/web's TitlePreview) needs to run the
// real composition's animation: the color/size fallback constants (used when a cuesheet predates
// the title.color/title.size schema fields), plus TitleCardView below.
export { TITLE_FONT_SIZE_PX, TITLE_TEXT_COLOR } from "./titleCardStyle.js";

/**
 * Props for the "TitleCard" Remotion composition (registered in index.tsx) - this is the
 * `Record<string, unknown>`-extending shape both the bundle's defaultProps and title.ts's
 * prepareTitleAssets pass as `inputProps` at render time, so the two stay in lockstep (see
 * title.ts's TitleCardInputProps type, which mirrors this one field-for-field).
 */
export interface TitleCardProps extends Record<string, unknown> {
  text: string;
  preset: TitlePreset;
  /** Redundant with fps*durationInFrames but kept explicit - see index.tsx's calculateMetadata,
   * which derives durationInFrames from this plus fps rather than the other way around. */
  durationInSeconds: number;
  fps: number;
  color: string;
  /** Title font size in pixels (schema's title.size); passed through to whichever preset renders. */
  fontSize: number;
  /** Project output dimensions (cue.project.width/height) - not read by TitleCard itself (the
   * AbsoluteFill layout fills whatever canvas size the composition resolves to), but threaded
   * through so index.tsx's calculateMetadata can override the composition's width/height per
   * render (the old Playwright capture matched the project's exact viewport size; a title card
   * rendered for e.g. a vertical-format project must be captured at that same resolution, not a
   * fixed default). */
  width: number;
  height: number;
}

/**
 * Props for TitleCardView (the browser-preview counterpart of TitleCard below) - the same
 * per-preset content fields, plus the frame source as plain props (TitleViewFrameProps) instead
 * of TitleCardProps's durationInSeconds (frames, not seconds, is what every XView needs; width/
 * height aren't read by any View either, so they're dropped here).
 */
export interface TitleCardViewProps extends TitleViewFrameProps {
  text: string;
  preset: TitlePreset;
  color: string;
  fontSize: number;
}

/**
 * Dispatches to one of the four preset title-card animations (fade/wordStagger/typing/highlight -
 * see docs/research/title-render-spike.md for why these replaced the old ASS/hand-rolled-HTML
 * presets). No AbsoluteFill background color is ever set here or in any preset component - PNG
 * frame capture (title.ts's prepareTitleAssets) omits the background automatically for png output,
 * so the card composites onto the underlying footage via alpha, not a solid color.
 */
export function TitleCard({ text, preset, color, fontSize }: TitleCardProps) {
  switch (preset) {
    case "fade":
      return <FadeTitle text={text} color={color} fontSize={fontSize} />;
    case "wordStagger":
      return <WordStaggerTitle text={text} color={color} fontSize={fontSize} />;
    case "typing":
      return <TypewriterTitle text={text} color={color} fontSize={fontSize} />;
    case "highlight":
      return <HighlightTitle text={text} color={color} fontSize={fontSize} />;
  }
}

/**
 * Browser-preview counterpart of TitleCard - mirrors its preset switch exactly, but dispatches to
 * each preset's browser-safe View (fed by plain frame/fps/durationInFrames props) instead of its
 * Remotion-context-reading wrapper. This is what apps/web's TitlePreview renders, driven by its
 * own requestAnimationFrame loop rather than a Remotion composition.
 */
export function TitleCardView({ frame, fps, durationInFrames, text, preset, color, fontSize }: TitleCardViewProps) {
  switch (preset) {
    case "fade":
      return <FadeTitleView frame={frame} fps={fps} durationInFrames={durationInFrames} text={text} color={color} fontSize={fontSize} />;
    case "wordStagger":
      return (
        <WordStaggerTitleView
          frame={frame}
          fps={fps}
          durationInFrames={durationInFrames}
          text={text}
          color={color}
          fontSize={fontSize}
        />
      );
    case "typing":
      return (
        <TypewriterTitleView
          frame={frame}
          fps={fps}
          durationInFrames={durationInFrames}
          text={text}
          color={color}
          fontSize={fontSize}
        />
      );
    case "highlight":
      return (
        <HighlightTitleView
          frame={frame}
          fps={fps}
          durationInFrames={durationInFrames}
          text={text}
          color={color}
          fontSize={fontSize}
        />
      );
  }
}
