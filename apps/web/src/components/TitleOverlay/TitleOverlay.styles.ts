import * as stylex from "@stylexjs/stylex";
import { radiusVars, spacingVars } from "@astryxdesign/core/theme/tokens.stylex";

/**
 * Component anatomy exemplar (CLAUDE.md "component layering"): styles live in their own
 * co-located stylex.create() file rather than inline in the component, so xstyle-able static
 * rules stay separate from the per-frame dynamic values (positions/opacities) that must be plain
 * inline `style` (see screen-spec.md rule 8 - xstyle for static, style for dynamic/conditional).
 */
export const styles = stylex.create({
  container: {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    overflow: "hidden",
  },
  backdrop: {
    position: "absolute",
    inset: 0,
    background: "#000000",
  },
  stage: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  // Compact restart/play-pause controls, pinned near the bottom of the video stage this overlay
  // sits over (not part of document flow, so it never eats layout - CLAUDE.md screen-spec rule).
  // pointerEvents is re-enabled here despite the container above disabling it, so the buttons stay
  // clickable while the rest of the overlay (the title-card animation itself) stays click-through.
  // A dark scrim chip (fixed dark regardless of app theme, same rationale as TrimStrip's trimDim -
  // it sits ON arbitrary video footage, not app chrome) makes the ghost IconButtons themselves
  // visible over both light and dark footage - previously these floated with no background and
  // read as invisible/undiscoverable over anything but a dark frame.
  controls: {
    position: "absolute",
    left: "50%",
    bottom: spacingVars["--spacing-2"],
    transform: "translateX(-50%)",
    display: "flex",
    justifyContent: "center",
    gap: spacingVars["--spacing-1"],
    paddingBlock: spacingVars["--spacing-1"],
    paddingInline: spacingVars["--spacing-2"],
    borderRadius: radiusVars["--radius-element"],
    backgroundColor: "#00000099", // theme-exempt
    pointerEvents: "auto",
  },
});
