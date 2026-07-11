import { Text } from "@astryxdesign/core/Text";

export interface BgmSummarySectionProps {
  trackCount: number;
}

/**
 * "Background music" summary of the Export step (③) — a single-line, read-only pointer only; real
 * editing lives in the (2) Edit step's BGM gutter (screen-spec section 5, 2026-07-09 - BGM editing
 * moved there since you need to see cut content to decide where the music changes). No Section/
 * heading chrome around it (docs/design-principles.md's density rule) - a one-line fact doesn't
 * need a page region of its own.
 */
export function BgmSummarySection({ trackCount }: BgmSummarySectionProps) {
  return (
    <Text type="supporting" color="secondary" data-testid="export-section-bgm-summary">
      Background music: {trackCount} {trackCount === 1 ? "track" : "tracks"} — edit in the ② Edit step
    </Text>
  );
}
