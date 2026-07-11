import type { TitlePreset } from "@cuesheet/schema";
import { FadeTitle } from "./FadeTitle.js";
import { HighlightTitle } from "./HighlightTitle.js";
import { TypewriterTitle } from "./TypewriterTitle.js";
import { WordStaggerTitle } from "./WordStaggerTitle.js";

// Re-exported so this file (the `@cuesheet/render/remotion` subpath's target - see package.json's
// exports map) is the single entry point browser code (apps/web's TitleOverlay) needs to run the
// real composition: the component/props plus the one color constant it isn't handed via schema.
export { TITLE_TEXT_COLOR } from "./titleCardStyle.js";

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
 * Dispatches to one of the four preset title-card animations (fade/wordStagger/typing/highlight -
 * see docs/research/title-render-spike.md for why these replaced the old ASS/hand-rolled-HTML
 * presets). No AbsoluteFill background color is ever set here or in any preset component - PNG
 * frame capture (title.ts's prepareTitleAssets) omits the background automatically for png output,
 * so the card composites onto the underlying footage via alpha, not a solid color.
 */
export function TitleCard({ text, preset, color }: TitleCardProps) {
  switch (preset) {
    case "fade":
      return <FadeTitle text={text} color={color} />;
    case "wordStagger":
      return <WordStaggerTitle text={text} color={color} />;
    case "typing":
      return <TypewriterTitle text={text} color={color} />;
    case "highlight":
      return <HighlightTitle text={text} color={color} />;
  }
}
