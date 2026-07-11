import { IconButton } from "@astryxdesign/core/IconButton";
import type { IconButtonProps } from "@astryxdesign/core/IconButton";

/**
 * Role: the scene candidate card's primary Add/Remove toggle action (MomentPalette) — an
 * Astryx IconButton so repeated card actions stay dense (design-principles.md #4, "decoration
 * scales to function"). Converted from a full-width text Button (2026-07-11) - icon-only removes
 * the need for that equal-width sizing tweak entirely, so this wrapper is now a plain named
 * alias, kept so this call site stays consistent/greppable alongside its sibling card action
 * (IntroOutroButton), same as before (CLAUDE.md "wrapper naming: purpose, not appearance").
 */
export function SceneCardButton(props: IconButtonProps) {
  return <IconButton {...props} />;
}
