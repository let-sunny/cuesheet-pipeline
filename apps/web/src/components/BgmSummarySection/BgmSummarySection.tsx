export interface BgmSummarySectionProps {
  trackCount: number;
}

/**
 * "Background music" section of the Export step (③) — a one-line, read-only summary only; real
 * editing lives in the (2) Edit step's BGM gutter (screen-spec section 5, 2026-07-09 - BGM editing
 * moved there since you need to see cut content to decide where the music changes).
 */
export function BgmSummarySection({ trackCount }: BgmSummarySectionProps) {
  return (
    <div className="settings-group" data-testid="export-section-bgm-summary">
      <h3>Background music</h3>
      <p className="settings-note">
        Background music: {trackCount} {trackCount === 1 ? "track" : "tracks"} — edit in the ② Edit step
      </p>
    </div>
  );
}
