// Pretendard @font-face + woff2 - bundled into the render so the title composition's Chrome draws
// titles in Pretendard (matching TITLE_FONT_FAMILY / the browser preview) instead of falling back
// to the platform sans. TitleCard gates render frames on this font finishing loading (delayRender).
import "pretendard/dist/web/variable/pretendardvariable.css";
import { Composition, registerRoot } from "remotion";
import { TitleCard, type TitleCardProps } from "./TitleCard.js";
import { TITLE_FONT_SIZE_PX, TITLE_TEXT_COLOR } from "./titleCardStyle.js";

/**
 * Remotion bundle entry point (see title.ts's prepareTitleAssets, which points @remotion/bundler's
 * `bundle({ entryPoint })` at this file). Registers the single "TitleCard" composition every
 * title-card preset renders through - see TitleCard.tsx for the preset dispatch.
 */
function RemotionRoot() {
  return (
    <Composition
      id="TitleCard"
      component={TitleCard}
      fps={DEFAULT_PROPS.fps}
      width={DEFAULT_PROPS.width}
      height={DEFAULT_PROPS.height}
      durationInFrames={Math.round(DEFAULT_PROPS.durationInSeconds * DEFAULT_PROPS.fps)}
      defaultProps={DEFAULT_PROPS}
      calculateMetadata={({ props }) => ({
        durationInFrames: Math.max(1, Math.round(props.durationInSeconds * props.fps)),
        fps: props.fps,
        width: props.width,
        height: props.height,
      })}
    />
  );
}

registerRoot(RemotionRoot);

/**
 * Default props used only for the Studio/preview default (real renders always pass their own
 * inputProps via selectComposition/renderFrames - title.ts's prepareTitleAssets passes
 * cue.project.width/height/fps and the title's own text/preset/durationS there, overriding every
 * field below via calculateMetadata).
 */
const DEFAULT_PROPS: TitleCardProps = {
  text: "",
  preset: "fade",
  durationInSeconds: 1,
  fps: 30,
  color: TITLE_TEXT_COLOR,
  fontSize: TITLE_FONT_SIZE_PX,
  width: 1920,
  height: 1080,
};
