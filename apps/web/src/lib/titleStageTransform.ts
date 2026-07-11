export interface TitleStageTransform {
  /** CSS `transform: scale(...)` factor mapping the title card's native project-pixel canvas
   * (e.g. a 1920x1080 composition, 72px font) onto the actual rendered box the stage occupies. */
  scale: number;
  /** CSS px offset (from the stage box's top-left) to center the scaled canvas within it. */
  offsetX: number;
  offsetY: number;
}

/**
 * Maps the title card's native project-pixel canvas (project.width x project.height - the same
 * coordinate space the real Remotion render captures, e.g. fontSize values are authored against
 * a 1920-wide canvas) onto whatever CSS pixel box TitlePreview's stage actually renders at. This
 * is the plain-CSS-transform equivalent of what @remotion/player did internally (scaling its
 * fixed composition resolution to fit the player's DOM box) - see TitlePreview.tsx, which renders
 * the composition at its native `projectWidth`x`projectHeight` size and applies this scale/offset
 * via a CSS transform rather than re-deriving font sizes per box size.
 *
 * Uses the smaller of the width/height ratios (never overflows the stage box even if its aspect
 * ratio doesn't exactly match the project's) and centers the result. Returns `scale: 1` and no
 * offset when the stage box hasn't been measured yet (width/height <= 0, e.g. before the first
 * ResizeObserver callback) so the canvas still renders at a sane size instead of collapsing.
 */
export function computeTitleStageTransform(
  boxWidth: number,
  boxHeight: number,
  projectWidth: number,
  projectHeight: number,
): TitleStageTransform {
  if (boxWidth <= 0 || boxHeight <= 0 || projectWidth <= 0 || projectHeight <= 0) {
    return { scale: 1, offsetX: 0, offsetY: 0 };
  }
  const scale = Math.min(boxWidth / projectWidth, boxHeight / projectHeight);
  const offsetX = (boxWidth - projectWidth * scale) / 2;
  const offsetY = (boxHeight - projectHeight * scale) / 2;
  return { scale, offsetX, offsetY };
}
